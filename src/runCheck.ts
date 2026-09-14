/**
 * Run the dependency classification check against a Vite project.
 *
 * Policy is in README.md ("Dependencies").
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { collectBundledPackages } from "./collectBundledPackages.ts";
import {
  classifyPackages,
  classifyUnlisted,
  type Classification,
} from "./dependencyClassification.ts";

export type ProjectType = "app" | "library";

export interface CheckOptions {
  /** Project root. Defaults to `process.cwd()`. */
  root?: string;
  /**
   * Vite config to build with. Omitted: Vite searches its usual names
   * (`vite.config.js`, `.mjs`, `.ts`, `.cjs`, `.mts`, `.cts`). Fixtures
   * pass `false` and rely on `input`.
   */
  configFile?: string | false;
  /** Entry module, used when `configFile` is false. Defaults to `src/main.ts`. */
  input?: string;
  /**
   * Application (default) or library. An app treats a first-party import
   * listed only in `peerDependencies` as `unlisted`. A library counts
   * peers as declared.
   */
  projectType?: ProjectType;
  /**
   * Runtime peers that never appear in the bundle under their own name.
   * Exempt from the `extra` check. Note why each one is here at the call site
   * — an uncommented allowlist entry looks like a silenced failure.
   */
  runtimePeers?: Iterable<string>;
  /**
   * Correct `devDependencies` whose bundle presence is only transitive.
   * Exempt from the `missing` check. Note why each one is here at the call
   * site — an uncommented allowlist entry looks like a silenced failure.
   */
  transitiveDevs?: Iterable<string>;
}

export interface CheckResult extends Classification {
  /** Package names present anywhere in the production output. */
  packages: Set<string>;
  /** Number of output chunks. */
  chunkCount: number;
  /**
   * Direct first-party production imports listed in none of the declared
   * fields. For an app that is `dependencies`, `devDependencies`, and
   * `optionalDependencies`. For a library, `peerDependencies` too.
   */
  unlisted: string[];
  /** Application (default) or library. Controls whether peers count as listed. */
  projectType: ProjectType;
  /** True when `missing`, `extra`, and `unlisted` are all empty. */
  ok: boolean;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export async function check(options: CheckOptions = {}): Promise<CheckResult> {
  const root = path.resolve(options.root ?? process.cwd());
  const configFile = options.configFile;
  const input =
    options.input ?? (configFile === false ? "src/main.ts" : undefined);
  const projectType = options.projectType ?? "app";

  const packageJson = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  ) as PackageJson;

  const { packages, directPackages, chunkCount } = await collectBundledPackages(
    {
      root,
      ...(configFile === undefined ? {} : { configFile }),
      ...(input === undefined ? {} : { input }),
    },
  );

  const dependencies = Object.keys(packageJson.dependencies ?? {});
  const devDependencies = Object.keys(packageJson.devDependencies ?? {});
  const peerDependencies = Object.keys(packageJson.peerDependencies ?? {});
  const optionalDependencies = Object.keys(
    packageJson.optionalDependencies ?? {},
  );

  const { missing, extra } = classifyPackages({
    bundled: packages,
    dependencies,
    devDependencies,
    ...(options.runtimePeers === undefined
      ? {}
      : { runtimePeers: options.runtimePeers }),
    ...(options.transitiveDevs === undefined
      ? {}
      : { transitiveDevs: options.transitiveDevs }),
  });

  const unlisted = classifyUnlisted({
    direct: directPackages,
    dependencies,
    devDependencies,
    optionalDependencies,
    ...(projectType === "library" ? { peerDependencies } : {}),
  });

  return {
    missing,
    extra,
    unlisted,
    packages,
    chunkCount,
    projectType,
    ok: missing.length === 0 && extra.length === 0 && unlisted.length === 0,
  };
}
