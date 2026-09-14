/**
 * Run a production build and report which npm packages made it into the output.
 *
 * We ask the bundler instead of scanning source so that an `import.meta.env.DEV`
 * guard actually drops the import. See README.md ("Dependencies").
 */
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "vite";
import {
  cssImportSpecifiers,
  isFirstPartySourceId,
  isVirtualModuleId,
  moduleFilePath,
  packageNameFromCssSpecifier,
  packageNameFromModuleId,
  packageNameFromSassSpecifier,
} from "./dependencyClassification.ts";
import {
  ensureWatchFileIntercept,
  restoreWatchFileIntercept,
  type WatchFileHost,
  type WatchFileIntercept,
} from "./watchFileIntercept.ts";

export interface CollectBundledPackagesOptions {
  /** Project root to build. */
  root: string;
  /**
   * Vite config to build with. Omitted: Vite searches its usual names.
   * Pass a path, or `false` and supply `input` when there is no config
   * (fixtures).
   */
  configFile?: string | false;
  /** Entry module, required when `configFile` is false (there is no index.html). */
  input?: string;
}

export interface BundleContents {
  /** Package names present anywhere in the output. */
  packages: Set<string>;
  /**
   * Package names imported by surviving first-party modules (source under
   * the project root). Virtual wrappers and same-package proxies are hops.
   */
  directPackages: Set<string>;
  /**
   * Output chunk count. Tests use this to confirm a fixture still code-splits.
   */
  chunkCount: number;
}

/**
 * Walk static and dynamic importers toward first-party source.
 *
 * Hops: virtuals (`\0…`, `virtual:`), same-package wrappers (CJS proxies),
 * and node_modules paths that are not a package (store / optimizer dirs).
 * Another package, or source outside `root`, stops that branch.
 */
function importedByFirstParty(
  getModuleInfo: (id: string) => {
    importers: readonly string[];
    dynamicImporters: readonly string[];
  } | null,
  startId: string,
  root: string,
  cache: Map<string, boolean>,
): boolean {
  const cached = cache.get(startId);
  if (cached !== undefined) {
    return cached;
  }

  const startPkg = packageNameFromModuleId(startId);
  const seen = new Set<string>([startId]);
  const stack = [startId];

  function walk(): boolean {
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined) {
        break;
      }

      const info = getModuleInfo(id);
      if (!info) {
        continue;
      }

      for (const importer of [...info.importers, ...info.dynamicImporters]) {
        if (seen.has(importer)) {
          continue;
        }
        seen.add(importer);

        if (isVirtualModuleId(importer)) {
          stack.push(importer);
          continue;
        }

        const importerPkg = packageNameFromModuleId(importer);
        if (importerPkg !== null) {
          if (importerPkg === startPkg) {
            stack.push(importer);
          }
          continue;
        }

        if (moduleFilePath(importer).includes("/node_modules/")) {
          stack.push(importer);
          continue;
        }

        if (isFirstPartySourceId(importer, root)) {
          return true;
        }
      }
    }

    return false;
  }

  const result = walk();
  cache.set(startId, result);
  return result;
}

/** Tail of the build queue; see `collectBundledPackages`. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Build `root` for production and return the packages that landed in the output.
 *
 * Uses `renderChunk`, not `moduleParsed` — the latter fires before
 * tree-shaking, so a guarded DEV import would still count. Walks every
 * chunk, not just entries: a dynamic import lives in an async chunk.
 * CSS-only packages live in `chunk.modules` here; Vite's css-post then
 * extracts them to assets and deletes pure-CSS chunks, so
 * `generateBundle` never sees them. Sass `@use` / `@forward` of a
 * package is inlined by the preprocessor, so those names come from a
 * Sass importer instead. CSS `@import` of a package is inlined the
 * same way: first-party specifiers are parsed from the stylesheet, and
 * nested package files come from `addWatchFile` during `vite:css` (one
 * wrap for the build; overlapping transforms share it, ALS attributes).
 * First-party files Vite resolved (aliases, `#imports`) are walked the
 * same as a relative `@import`; we do not implement the resolver.
 *
 * `directPackages` walks importers of those same modules so a first-party
 * import (source under `root`) is distinct from a transitive that only
 * appears because a library pulled it in.
 */
export function collectBundledPackages(
  options: CollectBundledPackagesOptions,
): Promise<BundleContents> {
  // One at a time: NODE_ENV is process-global, so overlapping builds would
  // clobber each other's pin and one of them would emit a development bundle.
  // Vitest forks per file so this doesn't happen today, but a bad interleave
  // is not worth the risk. Builds are cheap.
  const result = queue.then(() => collectOnce(options));
  // Swallow the rejection so a failed build doesn't stall later callers.
  queue = result.catch(() => undefined);
  return result;
}

async function collectOnce({
  root,
  configFile,
  input,
}: CollectBundledPackagesOptions): Promise<BundleContents> {
  const packages = new Set<string>();
  const directPackages = new Set<string>();
  const firstPartyCache = new Map<string, boolean>();
  const resolvedRoot = path.resolve(root);
  let chunkCount = 0;

  const stylesheetCompile = new AsyncLocalStorage<string>();
  const inlinedByStylesheet = new Map<
    string,
    { names: Set<string>; direct: Set<string> }
  >();
  const inlinedFallback = {
    names: new Set<string>(),
    direct: new Set<string>(),
  };
  let watchFileIntercept: WatchFileIntercept | null = null;
  const cssAtImportSeen = new Set<string>();

  function targetForCurrentStylesheet(): {
    names: Set<string>;
    direct: Set<string>;
  } {
    const stylesheet = stylesheetCompile.getStore();
    if (stylesheet === undefined) {
      return inlinedFallback;
    }
    const existing = inlinedByStylesheet.get(stylesheet);
    if (existing !== undefined) {
      return existing;
    }
    const created = { names: new Set<string>(), direct: new Set<string>() };
    inlinedByStylesheet.set(stylesheet, created);
    return created;
  }

  function recordInlinedPackage(
    name: string,
    containingFile: string | null,
  ): void {
    const target = targetForCurrentStylesheet();
    target.names.add(name);
    if (
      containingFile !== null &&
      isFirstPartySourceId(containingFile, resolvedRoot)
    ) {
      target.direct.add(name);
    }
  }

  function recordSassPackage(url: string, containingFile: string | null): void {
    const name = packageNameFromSassSpecifier(url);
    if (name === null) {
      return;
    }
    recordInlinedPackage(name, containingFile);
  }

  function recordWatchFile(file: string): void {
    const filePath = moduleFilePath(file);
    const name = packageNameFromModuleId(filePath);
    if (name !== null) {
      targetForCurrentStylesheet().names.add(name);
      return;
    }
    walkFirstPartyWatchedCss(filePath);
  }

  function walkFirstPartyWatchedCss(filePath: string): void {
    if (PREPROCESSOR_FILE.test(filePath)) {
      return;
    }
    if (!isFirstPartySourceId(filePath, resolvedRoot)) {
      return;
    }
    let code: string;
    try {
      code = fs.readFileSync(filePath, "utf8");
    } catch {
      return;
    }
    walkCssAtImports(code, filePath, cssAtImportSeen);
  }

  function recordCssAtImportsFromSource(code: string, id: string): void {
    const filePath = moduleFilePath(id);
    if (PREPROCESSOR_FILE.test(filePath)) {
      return;
    }
    walkCssAtImports(code, filePath, cssAtImportSeen);
  }

  function walkCssAtImports(
    code: string,
    containingFile: string,
    seen: Set<string>,
  ): void {
    if (seen.has(containingFile)) {
      return;
    }
    seen.add(containingFile);

    for (const spec of cssImportSpecifiers(code)) {
      // CSS @import is URL resolution (Vite preferRelative): "file.css"
      // and "dir/file.css" are local files, not npm names. Try the
      // filesystem first; only a miss is a package specifier.
      if (isCssRelativeUrl(spec)) {
        const resolved = resolveRelativeCss(containingFile, spec);
        if (resolved !== null) {
          let nextCode: string;
          try {
            nextCode = fs.readFileSync(resolved, "utf8");
          } catch {
            continue;
          }
          walkCssAtImports(nextCode, resolved, seen);
          continue;
        }
      }
      const name = packageNameFromCssSpecifier(spec);
      if (name !== null) {
        recordInlinedPackage(name, containingFile);
      }
    }
  }

  const sassImporter = {
    findFileUrl(
      url: string,
      context: { containingUrl?: URL | null },
    ): URL | null {
      recordSassPackage(
        url,
        context.containingUrl === undefined || context.containingUrl === null
          ? null
          : fileURLToPath(context.containingUrl),
      );
      return null;
    },
  };

  const collect: Plugin = {
    name: "collect-bundled-packages",
    config(config) {
      config.css ??= {};
      config.css.preprocessorOptions ??= {};
      prependSassImporter(config.css.preprocessorOptions, sassImporter);
    },
    configResolved(config) {
      if (
        !wrapCssTransformWithStylesheetContext(
          config.plugins,
          (id, run, host, code) =>
            stylesheetCompile.run(moduleFilePath(id), () => {
              recordCssAtImportsFromSource(code, id);
              watchFileIntercept = ensureWatchFileIntercept(
                host,
                recordWatchFile,
                watchFileIntercept,
              );
              return run();
            }),
        )
      ) {
        // Vite logLevel is silent; CSS @import has no Sass-style fallback.
        console.warn(
          "vite-dependency-classifier: vite:css transform was not wrapped; CSS @import packages will be treated as absent.",
        );
      }
    },
    renderChunk(_code, chunk) {
      // `chunk.modules` (not `moduleIds`): Vite keeps empty CSS
      // placeholders here via `moduleSideEffects: 'no-treeshake'`.
      for (const id of Object.keys(chunk.modules)) {
        const inlined = inlinedByStylesheet.get(moduleFilePath(id));
        if (inlined !== undefined) {
          for (const name of inlined.names) packages.add(name);
          for (const name of inlined.direct) directPackages.add(name);
        }

        const name = packageNameFromModuleId(id);
        if (!name) {
          continue;
        }
        packages.add(name);
        if (
          !directPackages.has(name) &&
          importedByFirstParty(
            this.getModuleInfo.bind(this),
            id,
            resolvedRoot,
            firstPartyCache,
          )
        ) {
          directPackages.add(name);
        }
      }
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === "chunk") chunkCount++;
      }
      // vite:css transform was not wrapped; Sass loads still count as
      // bundled because the preprocessor ran during this production build.
      if (inlinedByStylesheet.size === 0) {
        for (const name of inlinedFallback.names) packages.add(name);
        for (const name of inlinedFallback.direct) directPackages.add(name);
      }
    },
  };

  // Vite looks at both `mode` and NODE_ENV. Under Vitest (NODE_ENV=test) or a
  // shell with NODE_ENV=development, `import.meta.env.DEV` stays true and
  // guarded imports survive. Setting mode alone is not enough — we hit this
  // when the guarded-dev-import fixture passed standalone and failed in CI.
  const previousNodeEnv = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = "production";

  try {
    await build({
      root,
      ...(configFile === undefined ? {} : { configFile }),
      mode: "production",
      logLevel: "silent",
      // file: deps (and most workspace links) are symlinks. Vite realpaths
      // them by default, which strips `/node_modules/<name>/` from the id.
      resolve: { preserveSymlinks: true },
      build: {
        // Don't write to disk — we only need the module graph, and we
        // shouldn't overwrite a real dist/.
        write: false,
        ...(input ? { rollupOptions: { input } } : {}),
      },
      plugins: [collect],
    });
  } finally {
    restoreWatchFileIntercept(watchFileIntercept);
    if (previousNodeEnv === undefined) {
      delete process.env["NODE_ENV"];
    } else {
      process.env["NODE_ENV"] = previousNodeEnv;
    }
  }

  return { packages, directPackages, chunkCount };
}

const PREPROCESSOR_FILE = /\.(scss|sass|less|styl|stylus)$/i;

/** Absolute `/…`, protocol-relative `//…`, and `http(s):` / `data:` are not files. */
function isCssRelativeUrl(spec: string): boolean {
  return !spec.startsWith("/") && !spec.includes(":");
}

function resolveRelativeCss(fromFile: string, spec: string): string | null {
  const resolved = path.resolve(path.dirname(fromFile), spec);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return resolved;
  }
  if (path.extname(resolved) === "") {
    const withCss = `${resolved}.css`;
    if (fs.existsSync(withCss) && fs.statSync(withCss).isFile()) {
      return withCss;
    }
  }
  return null;
}

function prependSassImporter(
  preprocessorOptions: Record<string, unknown>,
  importer: object,
): void {
  for (const lang of ["scss", "sass"]) {
    const current = preprocessorOptions[lang];
    const base =
      current !== undefined &&
      typeof current === "object" &&
      !Array.isArray(current)
        ? { ...(current as Record<string, unknown>) }
        : {};
    const nextImporters: object[] = [importer];
    const existing = base["importers"];
    if (Array.isArray(existing)) {
      for (const item of existing) {
        if (typeof item === "object" && item !== null) {
          nextImporters.push(item as object);
        }
      }
    }
    preprocessorOptions[lang] = {
      ...base,
      importers: nextImporters,
    };
  }
}

export function wrapCssTransformWithStylesheetContext(
  plugins: readonly Plugin[],
  runForId: (
    id: string,
    run: () => unknown,
    host: WatchFileHost,
    code: string,
  ) => unknown,
): boolean {
  for (const plugin of plugins) {
    if (plugin.name !== "vite:css") {
      continue;
    }
    const transform: unknown = plugin.transform;
    if (typeof transform === "function") {
      const original = transform as (
        this: WatchFileHost,
        code: string,
        id: string,
        options?: unknown,
      ) => unknown;
      plugin.transform = function wrappedCssTransform(
        this: WatchFileHost,
        code: string,
        id: string,
        options?: unknown,
      ) {
        return runForId(
          id,
          () => original.call(this, code, id, options),
          this,
          code,
        );
      } as NonNullable<Plugin["transform"]>;
      return true;
    }
    if (
      typeof transform === "object" &&
      transform !== null &&
      "handler" in transform &&
      typeof transform.handler === "function"
    ) {
      const original = transform.handler as (
        this: WatchFileHost,
        code: string,
        id: string,
        options?: unknown,
      ) => unknown;
      transform.handler = function wrappedCssTransform(
        this: WatchFileHost,
        code: string,
        id: string,
        options?: unknown,
      ) {
        return runForId(
          id,
          () => original.call(this, code, id, options),
          this,
          code,
        );
      };
      return true;
    }
  }
  return false;
}
