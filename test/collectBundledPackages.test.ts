import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectBundledPackages } from "../src/collectBundledPackages.ts";
import {
  classifyPackages,
  classifyUnlisted,
} from "../src/dependencyClassification.ts";

/**
 * Real production builds against ./fixtures. We need the bundler for this —
 * tree-shaking, async chunks — so stubbing inputs would miss the bugs.
 *
 * Fixtures import fixture-lib / fixture-leaf / fixture-css via `file:` at the
 * repo root so Vite resolves them as `/node_modules/<name>/`. Nested store
 * layouts are covered in dependencyClassification.test.ts.
 */
function fixture(name: string) {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

function collect(name: string) {
  return collectBundledPackages({
    root: fixture(name),
    configFile: false,
    input: "src/main.ts",
  });
}

describe("collectBundledPackages", () => {
  it("collects a package and its transitive dependencies", async () => {
    const { packages: bundled, directPackages } = await collect("clean");

    expect(bundled.has("fixture-lib")).toBe(true);
    expect(directPackages.has("fixture-lib")).toBe(true);
    // Transitive, not declared. classifyPackages has to ignore these.
    expect(bundled.has("fixture-leaf")).toBe(true);
    expect(directPackages.has("fixture-leaf")).toBe(false);
  });

  it("maps every collected id to a usable package name", async () => {
    const { packages: bundled } = await collect("clean");

    expect(bundled.size).toBeGreaterThan(0);
    for (const name of bundled) {
      expect(name).toBeTruthy();
      expect(name).not.toContain("node_modules");
      expect(name.startsWith("/")).toBe(false);
    }
  });
});

describe("concurrent calls", () => {
  it("keeps each call's result its own, and restores NODE_ENV", async () => {
    // Overlapping builds: each should get its own result and NODE_ENV
    // should come back. This won't always fail without the queue — Vite
    // timing is luck — but it fails often enough to catch a regression.
    const nodeEnvBefore = process.env["NODE_ENV"];

    const [clean, guarded] = await Promise.all([
      collect("clean"),
      collect("guarded-dev-import"),
    ]);

    expect(clean.packages.has("fixture-lib")).toBe(true);
    expect(clean.directPackages.has("fixture-lib")).toBe(true);
    expect(guarded.packages.has("fixture-lib")).toBe(false);
    expect(guarded.directPackages.has("fixture-lib")).toBe(false);
    // Guarded fixture has no other imports. A leaked NODE_ENV=development
    // would leave fixture-lib in the bundle.
    expect(guarded.packages.size).toBe(0);
    expect(guarded.directPackages.size).toBe(0);

    expect(process.env["NODE_ENV"]).toBe(nodeEnvBefore);
  });
});

describe("a failed build", () => {
  it("restores NODE_ENV and leaves the queue usable", async () => {
    // A throw still has to restore NODE_ENV and not leave the queue rejected
    // (that would poison every later call). Start both before awaiting so
    // the second is actually queued behind the failure.
    const nodeEnvBefore = process.env["NODE_ENV"];

    const failing = collect("does-not-exist");
    const queuedBehind = collect("clean");

    await expect(failing).rejects.toThrow();

    const { packages, directPackages } = await queuedBehind;
    expect(packages.has("fixture-lib")).toBe(true);
    expect(directPackages.has("fixture-lib")).toBe(true);

    expect(process.env["NODE_ENV"]).toBe(nodeEnvBefore);
  });
});

describe("fixture classification", () => {
  it("reports nothing for a correctly declared dependency", async () => {
    const { packages: bundled, directPackages } = await collect("clean");

    expect(
      classifyPackages({
        bundled,
        dependencies: ["fixture-lib"],
        devDependencies: [],
      }),
    ).toEqual({ missing: [], extra: [] });

    expect(
      classifyUnlisted({
        direct: directPackages,
        dependencies: ["fixture-lib"],
        devDependencies: [],
      }),
    ).toEqual([]);

    // Empty findings aren't enough — the collector could just have returned [].
    expect(bundled.has("fixture-leaf")).toBe(true);
    expect(directPackages.has("fixture-lib")).toBe(true);
    expect(directPackages.has("fixture-leaf")).toBe(false);
  });

  it("collects a package reached only through a dynamic import", async () => {
    const {
      packages: bundled,
      directPackages,
      chunkCount,
    } = await collect("dynamic-import");

    expect(bundled.has("fixture-lib")).toBe(true);
    expect(directPackages.has("fixture-lib")).toBe(true);
    // Confirm it still code-splits; otherwise this test covers nothing.
    expect(chunkCount).toBeGreaterThan(1);

    expect(
      classifyPackages({
        bundled,
        dependencies: ["fixture-lib"],
        devDependencies: [],
      }),
    ).toEqual({ missing: [], extra: [] });

    expect(
      classifyUnlisted({
        direct: directPackages,
        dependencies: [],
        devDependencies: [],
      }),
    ).toEqual(["fixture-lib"]);
  });

  it("reports a devDependency that reaches the bundle", async () => {
    const { packages: bundled, directPackages } = await collect(
      "undeclared-runtime-import",
    );

    expect(directPackages.has("fixture-lib")).toBe(true);

    expect(
      classifyPackages({
        bundled,
        dependencies: [],
        devDependencies: ["fixture-lib"],
      }),
    ).toEqual({ missing: ["fixture-lib"], extra: [] });

    expect(
      classifyUnlisted({
        direct: directPackages,
        dependencies: [],
        devDependencies: ["fixture-lib"],
      }),
    ).toEqual([]);
  });

  it("reports nothing for a devDependency behind an import.meta.env.DEV guard", async () => {
    const { packages: bundled, directPackages } =
      await collect("guarded-dev-import");

    // Check the bundle, not just the findings — a collector using
    // moduleParsed would still see this package after tree-shaking.
    expect(bundled.has("fixture-lib")).toBe(false);
    expect(directPackages.has("fixture-lib")).toBe(false);

    expect(
      classifyPackages({
        bundled,
        dependencies: [],
        devDependencies: ["fixture-lib"],
      }),
    ).toEqual({ missing: [], extra: [] });

    expect(
      classifyUnlisted({
        direct: directPackages,
        dependencies: [],
        devDependencies: [],
      }),
    ).toEqual([]);
  });

  it("collects a package imported only as CSS", async () => {
    const { packages: bundled, directPackages } =
      await collect("css-only-import");

    expect(bundled.has("fixture-css")).toBe(true);
    expect(directPackages.has("fixture-css")).toBe(true);

    expect(
      classifyPackages({
        bundled,
        dependencies: ["fixture-css"],
        devDependencies: [],
      }),
    ).toEqual({ missing: [], extra: [] });

    expect(
      classifyUnlisted({
        direct: directPackages,
        dependencies: ["fixture-css"],
        devDependencies: [],
      }),
    ).toEqual([]);

    expect(
      classifyUnlisted({
        direct: directPackages,
        dependencies: [],
        devDependencies: [],
      }),
    ).toEqual(["fixture-css"]);
  });

  it("reports a CSS-only package declared as a devDependency", async () => {
    const { packages: bundled } = await collect("css-only-import");

    expect(
      classifyPackages({
        bundled,
        dependencies: [],
        devDependencies: ["fixture-css"],
      }),
    ).toEqual({ missing: ["fixture-css"], extra: [] });
  });

  it("reports nothing for a CSS import behind an import.meta.env.DEV guard", async () => {
    const { packages: bundled, directPackages } =
      await collect("guarded-css-import");

    // Check the bundle, not just the findings — a collector using
    // moduleParsed would still see this package after tree-shaking.
    expect(bundled.has("fixture-css")).toBe(false);
    expect(directPackages.has("fixture-css")).toBe(false);

    expect(
      classifyPackages({
        bundled,
        dependencies: [],
        devDependencies: ["fixture-css"],
      }),
    ).toEqual({ missing: [], extra: [] });

    expect(
      classifyUnlisted({
        direct: directPackages,
        dependencies: [],
        devDependencies: [],
      }),
    ).toEqual([]);
  });

  it("reports a declared dependency that never reaches the bundle", async () => {
    const { packages: bundled, directPackages } = await collect(
      "unused-declared-dep",
    );

    expect(directPackages.has("unused-pkg")).toBe(false);

    expect(
      classifyPackages({
        bundled,
        dependencies: ["unused-pkg"],
        devDependencies: [],
      }),
    ).toEqual({ missing: [], extra: ["unused-pkg"] });

    expect(
      classifyUnlisted({
        direct: directPackages,
        dependencies: [],
        devDependencies: [],
      }),
    ).toEqual([]);
  });

  it("exempts a transitive-only devDependency, and reports it without the allowlist", async () => {
    // With the allowlist and without it. The second assertion is the one
    // that fails if transitiveDevs is ignored.
    const { packages: bundled, directPackages } =
      await collect("transitive-dev");
    const declared = {
      bundled,
      dependencies: ["fixture-lib"],
      devDependencies: ["fixture-leaf"],
    };

    expect(bundled.has("fixture-leaf")).toBe(true);
    expect(directPackages.has("fixture-lib")).toBe(true);
    expect(directPackages.has("fixture-leaf")).toBe(false);

    expect(
      classifyPackages({ ...declared, transitiveDevs: ["fixture-leaf"] }),
    ).toEqual({ missing: [], extra: [] });

    expect(classifyPackages(declared)).toEqual({
      missing: ["fixture-leaf"],
      extra: [],
    });

    expect(
      classifyUnlisted({
        direct: directPackages,
        dependencies: ["fixture-lib"],
        devDependencies: ["fixture-leaf"],
      }),
    ).toEqual([]);
  });

  it("exempts a runtime peer, and reports it without the allowlist", async () => {
    // With the allowlist and without it. The second assertion is the one
    // that fails if runtimePeers is ignored.
    const { packages: bundled, directPackages } = await collect("runtime-peer");
    const declared = {
      bundled,
      dependencies: ["runtime-peer-pkg"],
      devDependencies: [],
    };

    expect(directPackages.has("runtime-peer-pkg")).toBe(false);

    expect(
      classifyPackages({ ...declared, runtimePeers: ["runtime-peer-pkg"] }),
    ).toEqual({ missing: [], extra: [] });

    expect(classifyPackages(declared)).toEqual({
      missing: [],
      extra: ["runtime-peer-pkg"],
    });

    expect(
      classifyUnlisted({
        direct: directPackages,
        dependencies: [],
        devDependencies: [],
      }),
    ).toEqual([]);
  });

  it("reports a dependency reached only through a type-only import", async () => {
    const { packages: bundled, directPackages } =
      await collect("type-only-import");

    // import type is erased. Check the bundle too — extra would also fire
    // if the import never built.
    expect(bundled.has("fixture-lib")).toBe(false);
    expect(directPackages.has("fixture-lib")).toBe(false);

    expect(
      classifyPackages({
        bundled,
        dependencies: ["fixture-lib"],
        devDependencies: [],
      }),
    ).toEqual({ missing: [], extra: ["fixture-lib"] });

    expect(
      classifyUnlisted({
        direct: directPackages,
        dependencies: [],
        devDependencies: [],
      }),
    ).toEqual([]);
  });

  it("treats a first-party import with no declaration as unlisted", async () => {
    const { packages: bundled, directPackages } =
      await collect("unlisted-import");

    expect(directPackages.has("fixture-lib")).toBe(true);
    expect(directPackages.has("fixture-leaf")).toBe(false);
    expect(bundled.has("fixture-leaf")).toBe(true);

    expect(
      classifyPackages({
        bundled,
        dependencies: [],
        devDependencies: [],
      }),
    ).toEqual({ missing: [], extra: [] });

    expect(
      classifyUnlisted({
        direct: directPackages,
        dependencies: [],
        devDependencies: [],
      }),
    ).toEqual(["fixture-lib"]);
  });

  it("does not treat an aliased workspace package's deps as first-party", async () => {
    const { packages: bundled, directPackages } = await collectBundledPackages({
      root: fixture("aliased-workspace"),
    });

    expect(bundled.has("fixture-leaf")).toBe(true);
    expect(directPackages.has("fixture-leaf")).toBe(false);

    expect(
      classifyUnlisted({
        direct: directPackages,
        dependencies: [],
        devDependencies: [],
      }),
    ).toEqual([]);
  });
});
