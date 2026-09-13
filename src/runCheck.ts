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
  type Classification,
} from "./dependencyClassification.ts";

export interface CheckOptions {
  /** Project root. Defaults to `process.cwd()`. */
  root?: string;
  /**
   * Vite config to build with. Defaults to `<root>/vite.config.ts`.
   * Fixtures pass `false` and rely on `input`.
   */
  configFile?: string | false;
  /** Entry module, used when `configFile` is false. Defaults to `src/main.ts`. */
  input?: string;
  /**
   * Runtime peers that never appear in the bundle under their own name.
   * Exempt from the `extra` check. Note why each one is here at the call site
   * — an uncommented allowlist entry looks like a silenced failure.
   */
  runtimePeers?: Iterable<string>;
}

export interface CheckResult extends Classification {
  /** Package names present anywhere in the production output. */
  packages: Set<string>;
  /** Number of output chunks. */
  chunkCount: number;
  /** True when `missing` and `extra` are both empty. */
  ok: boolean;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export async function check(options: CheckOptions = {}): Promise<CheckResult> {
  const root = path.resolve(options.root ?? process.cwd());
  const configFile = options.configFile ?? path.join(root, "vite.config.ts");
  const input =
    options.input ?? (configFile === false ? "src/main.ts" : undefined);

  const packageJson = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  ) as PackageJson;

  const { packages, chunkCount } = await collectBundledPackages({
    root,
    configFile,
    ...(input === undefined ? {} : { input }),
  });

  const { missing, extra } = classifyPackages({
    bundled: packages,
    dependencies: Object.keys(packageJson.dependencies ?? {}),
    devDependencies: Object.keys(packageJson.devDependencies ?? {}),
    ...(options.runtimePeers === undefined
      ? {}
      : { runtimePeers: options.runtimePeers }),
  });

  return {
    missing,
    extra,
    packages,
    chunkCount,
    ok: missing.length === 0 && extra.length === 0,
  };
}
