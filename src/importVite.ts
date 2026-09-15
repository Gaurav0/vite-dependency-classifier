/**
 * Load `vite` the same way that project would: from its `package.json`,
 * not from this package.
 *
 * A static `import from "vite"` resolves from the classifier. `npx` then
 * either fails to find `vite` or loads a second copy from the npx cache.
 * `createRequire(project/package.json)` is the same issuer Node uses for
 * that app, including a hoisted workspace install. There is no fallback
 * to this package's tree — that would pick up the npx copy.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function resolveViteFromProject(root: string): string {
  const resolvedRoot = path.resolve(root);
  const requireFromProject = createRequire(
    path.join(resolvedRoot, "package.json"),
  );

  let vitePath: string;
  try {
    vitePath = requireFromProject.resolve("vite");
  } catch {
    throw new Error(
      `Cannot resolve vite from ${resolvedRoot}. Install vite@^8 in this project.`,
    );
  }

  let version: unknown;
  try {
    const pkgPath = requireFromProject.resolve("vite/package.json");
    version = (
      JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: unknown }
    ).version;
  } catch {
    version = undefined;
  }

  if (typeof version !== "string" || Number.parseInt(version, 10) !== 8) {
    throw new Error(
      `vite@${String(version)} at ${vitePath} is not ^8. vite-dependency-classifier needs that project's Vite 8.`,
    );
  }

  return vitePath;
}

export async function importViteFromProject(
  root: string,
): Promise<typeof import("vite")> {
  const vitePath = resolveViteFromProject(root);
  return import(pathToFileURL(vitePath).href) as Promise<typeof import("vite")>;
}
