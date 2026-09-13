/**
 * Run a production build and report which npm packages made it into the output.
 *
 * We ask the bundler instead of scanning source so that an `import.meta.env.DEV`
 * guard actually drops the import. See README.md ("Dependencies").
 */
import { build, type Plugin } from "vite";
import { packageNameFromModuleId } from "./dependencyClassification.ts";

export interface CollectBundledPackagesOptions {
  /** Project root to build. */
  root: string;
  /**
   * Vite config to build with. Pass a path, or `false` and supply `input`
   * when there is no config (fixtures).
   */
  configFile: string | false;
  /** Entry module, required when `configFile` is false (there is no index.html). */
  input?: string;
}

export interface BundleContents {
  /** Package names present anywhere in the output. */
  packages: Set<string>;
  /**
   * Output chunk count. Tests use this to confirm a fixture still code-splits.
   */
  chunkCount: number;
}

/** Tail of the build queue; see `collectBundledPackages`. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Build `root` for production and return the packages that landed in the output.
 *
 * Uses `generateBundle`, not `moduleParsed` — the latter fires before
 * tree-shaking, so a guarded DEV import would still count. Walks every
 * chunk, not just entries: a dynamic import lives in an async chunk.
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
  let chunkCount = 0;

  const collect: Plugin = {
    name: "collect-bundled-packages",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        chunkCount++;
        for (const id of Object.keys(output.modules)) {
          const name = packageNameFromModuleId(id);
          if (name) packages.add(name);
        }
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
      configFile,
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
    if (previousNodeEnv === undefined) {
      delete process.env["NODE_ENV"];
    } else {
      process.env["NODE_ENV"] = previousNodeEnv;
    }
  }

  return { packages, chunkCount };
}
