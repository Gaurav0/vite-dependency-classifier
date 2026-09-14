/**
 * Classify package.json fields against what actually landed in the bundle.
 * No filesystem or build — that's in collectBundledPackages.
 *
 * See README.md ("Dependencies") for the policy.
 */

import path from "node:path";

const NODE_MODULES = "/node_modules/";

/**
 * Rollup/Vite virtual: NUL prefix, or the unresolved `virtual:` form some
 * plugins leave on importers.
 */
export function isVirtualModuleId(id: string): boolean {
  return id.startsWith("\0") || id.startsWith("virtual:");
}

/** Path part of a module id, without `?query`. */
export function moduleFilePath(id: string): string {
  const query = id.indexOf("?");
  return query === -1 ? id : id.slice(0, query);
}

function isInsideDir(filePath: string, root: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(root, filePath);
  const relative = path.relative(resolvedRoot, resolvedFile);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

/**
 * True when `id` is this project's source: under `root`, not a package,
 * not a virtual, not a node_modules store path.
 *
 * A Vite alias to another package's files lives outside `root`, so it is
 * not first-party here. That package's dependencies are not `unlisted` in
 * this project.
 */
export function isFirstPartySourceId(id: string, root: string): boolean {
  if (isVirtualModuleId(id)) {
    return false;
  }
  if (packageNameFromModuleId(id) !== null) {
    return false;
  }
  const filePath = moduleFilePath(id);
  if (filePath.includes(NODE_MODULES)) {
    return false;
  }
  return isInsideDir(filePath, root);
}

/**
 * Package name from a Rollup/Rolldown module id, or null for first-party
 * and virtual modules.
 *
 * Nested node_modules (pnpm store, hoisted deps) put a store dir in the
 * first `/node_modules/` segment. The last one is the actual package.
 */
export function packageNameFromModuleId(id: string): string | null {
  // Virtual modules get a NUL prefix from Rollup. Some (\0commonjsHelpers.js)
  // have no slashes, so catch them before the path walk.
  if (isVirtualModuleId(id)) {
    return null;
  }

  const lastIndex = id.lastIndexOf(NODE_MODULES);
  if (lastIndex === -1) {
    return null;
  }

  const segments = id.slice(lastIndex + NODE_MODULES.length).split("/");
  return packageNameFromSegments(segments[0], segments[1]);
}

/**
 * Package name from a Sass `@use` / `@forward` / `@import` specifier.
 *
 * Sass inlines those files; they never become Vite module ids. Relative
 * paths, absolute paths, and `sass:` builtins are not packages. `pkg:`
 * is the Node package importer.
 */
export function packageNameFromSassSpecifier(url: string): string | null {
  if (url.startsWith("sass:") || url.startsWith(".") || url.startsWith("/")) {
    return null;
  }

  const spec = url.startsWith("pkg:") ? url.slice("pkg:".length) : url;
  if (spec.includes(":")) {
    return null;
  }

  const segments = spec.split("/");
  return packageNameFromSegments(segments[0], segments[1]);
}

/**
 * Package name from a CSS `@import` specifier.
 *
 * Vite inlines `@import`; those files never become Vite module ids.
 * `url()`, quotes, `layer()`, and media queries unwrap to the path.
 * Relative paths, absolute paths, `http(s):`, `data:`, and
 * protocol-relative URLs are not packages.
 */
export function packageNameFromCssSpecifier(spec: string): string | null {
  const unwrapped = unwrapCssImportSpecifier(spec);
  if (
    unwrapped.startsWith(".") ||
    unwrapped.startsWith("/") ||
    unwrapped.includes(":")
  ) {
    return null;
  }

  const segments = unwrapped.split("/");
  return packageNameFromSegments(segments[0], segments[1]);
}

/**
 * Specifiers from CSS `@import` rules, in source order.
 *
 * Handles `"pkg"`, `'pkg'`, `url("pkg")`, `url('pkg')`, `url(pkg)`,
 * and trailing `layer()` / media queries. Does not interpret the
 * specifier; `packageNameFromCssSpecifier` decides if it is a package.
 */
export function cssImportSpecifiers(code: string): string[] {
  const specifiers: string[] = [];
  const atImport =
    /@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^"')\s;]+))\s*\)?/gi;
  let match: RegExpExecArray | null;
  while ((match = atImport.exec(code)) !== null) {
    const spec = match[1] ?? match[2] ?? match[3];
    if (spec !== undefined && spec !== "") {
      specifiers.push(spec);
    }
  }
  return specifiers;
}

function unwrapCssImportSpecifier(spec: string): string {
  const trimmed = spec.trim();
  const url = /^url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)$/i.exec(trimmed);
  if (url) {
    return (url[1] ?? url[2] ?? url[3] ?? "").trim();
  }
  const quoted = /^(?:"([^"]*)"|'([^']*)')$/.exec(trimmed);
  if (quoted) {
    return (quoted[1] ?? quoted[2] ?? "").trim();
  }
  return trimmed;
}

function packageNameFromSegments(
  first: string | undefined,
  second: string | undefined,
): string | null {
  if (!first) {
    return null;
  }

  // A dotted first segment is a store directory, not a package name.
  if (first.startsWith(".")) {
    return null;
  }

  if (first.startsWith("@")) {
    return second ? `${first}/${second}` : null;
  }

  return first;
}

export interface ClassifyPackagesInput {
  /** Package names that reached the production bundle. */
  bundled: Iterable<string>;
  /** Names from package.json `dependencies`. */
  dependencies: Iterable<string>;
  /** Names from package.json `devDependencies`. */
  devDependencies: Iterable<string>;
  /**
   * Runtime peers that never show up in the bundle under their own name
   * (e.g. @emotion/react pulled in by a UI library). Skipped by `extra`.
   */
  runtimePeers?: Iterable<string>;
  /**
   * Correct `devDependencies` whose bundle presence is only transitive
   * (e.g. a test util that a shipped library also depends on). Skipped
   * by `missing`.
   */
  transitiveDevs?: Iterable<string>;
}

export interface Classification {
  /** Declared as devDependencies but present in the production bundle. */
  missing: string[];
  /** Declared as dependencies but absent from the production bundle. */
  extra: string[];
}

/**
 * Compare the production bundle against package.json.
 *
 * `missing` is bundled packages that are declared as devDependencies —
 * not "everything in the bundle that isn't a dependency". Transitive
 * packages (scheduler via react-dom, etc.) show up in the bundle but
 * aren't declared, and that's fine.
 *
 * An unlisted package — imported by first-party production source but
 * listed in none of the four package.json fields — looks identical to
 * a transitive dep here. Use `classifyUnlisted` with the first-party
 * direct set, not this function.
 */
export function classifyPackages({
  bundled,
  dependencies,
  devDependencies,
  runtimePeers = [],
  transitiveDevs = [],
}: ClassifyPackagesInput): Classification {
  const bundledSet = new Set(bundled);
  const dependencySet = new Set(dependencies);
  const runtimePeerSet = new Set(runtimePeers);
  const transitiveDevSet = new Set(transitiveDevs);

  const missing = [...new Set(devDependencies)]
    // Listed in both → treat as a production dep, don't report it.
    .filter(
      (name) =>
        !dependencySet.has(name) &&
        bundledSet.has(name) &&
        !transitiveDevSet.has(name),
    )
    .sort();

  const extra = [...dependencySet]
    .filter((name) => !bundledSet.has(name) && !runtimePeerSet.has(name))
    .sort();

  return { missing, extra };
}

export interface ClassifyUnlistedInput {
  /** Package names imported by surviving first-party production modules. */
  direct: Iterable<string>;
  /** Names from package.json `dependencies`. */
  dependencies: Iterable<string>;
  /** Names from package.json `devDependencies`. */
  devDependencies: Iterable<string>;
  /** Names from package.json `peerDependencies`. Pass for a library. */
  peerDependencies?: Iterable<string>;
  /** Names from package.json `optionalDependencies`. */
  optionalDependencies?: Iterable<string>;
}

/**
 * Direct first-party production imports that are listed in none of the
 * fields passed in. An application omits `peerDependencies` so a
 * peer-only import is unlisted. A library passes them so a peer counts
 * as declared.
 *
 * `missing` / `extra` stay in `classifyPackages`. A direct import that
 * is already a `devDependency` is declared, so it is not unlisted.
 */
export function classifyUnlisted({
  direct,
  dependencies,
  devDependencies,
  peerDependencies = [],
  optionalDependencies = [],
}: ClassifyUnlistedInput): string[] {
  const declared = new Set([
    ...dependencies,
    ...devDependencies,
    ...peerDependencies,
    ...optionalDependencies,
  ]);

  return [...new Set(direct)].filter((name) => !declared.has(name)).sort();
}
