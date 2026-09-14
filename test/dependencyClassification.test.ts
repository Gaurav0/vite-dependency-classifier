import { describe, expect, it } from "vitest";
import {
  classifyPackages,
  packageNameFromModuleId,
} from "../src/dependencyClassification.ts";

describe("packageNameFromModuleId", () => {
  it("reads a package name from a plain node_modules path", () => {
    expect(packageNameFromModuleId("/repo/node_modules/react/index.js")).toBe(
      "react",
    );
  });

  it("takes the last node_modules segment, not the first", () => {
    expect(
      packageNameFromModuleId(
        "/repo/node_modules/.store/react@19.2.5/node_modules/react/index.js",
      ),
    ).toBe("react");
  });

  it("keeps the scope on a scoped package", () => {
    expect(
      packageNameFromModuleId("/repo/node_modules/@mui/material/Box.js"),
    ).toBe("@mui/material");
  });

  it("keeps the scope on a scoped package under a nested node_modules", () => {
    expect(
      packageNameFromModuleId(
        "/repo/node_modules/.store/@mui+material@9.3.1/node_modules/@mui/material/index.js",
      ),
    ).toBe("@mui/material");
  });

  it("ignores the subpath of a deep import", () => {
    expect(
      packageNameFromModuleId(
        "/repo/node_modules/@mui/icons-material/esm/Close.js",
      ),
    ).toBe("@mui/icons-material");
  });

  it("resolves nested node_modules to the innermost package", () => {
    expect(
      packageNameFromModuleId("/repo/node_modules/a/node_modules/b/index.js"),
    ).toBe("b");
  });

  it("returns null for a store directory with no nested package", () => {
    expect(
      packageNameFromModuleId(
        "/repo/node_modules/.store/react@19.2.5/index.js",
      ),
    ).toBeNull();
  });

  it("returns null for first-party source", () => {
    expect(packageNameFromModuleId("/repo/src/App.tsx")).toBeNull();
  });

  it("returns null for a virtual module", () => {
    expect(packageNameFromModuleId("\0vite/preload-helper")).toBeNull();
  });

  it("returns null for a virtual module with no path separators", () => {
    expect(packageNameFromModuleId("\0commonjsHelpers.js")).toBeNull();
  });
});

describe("classifyPackages", () => {
  const base = {
    bundled: [],
    dependencies: [],
    devDependencies: [],
  };

  it("reports nothing for a bundled package declared as a dependency", () => {
    expect(
      classifyPackages({
        ...base,
        bundled: ["react"],
        dependencies: ["react"],
      }),
    ).toEqual({ missing: [], extra: [] });
  });

  it("reports a bundled package declared as a devDependency", () => {
    expect(
      classifyPackages({
        ...base,
        bundled: ["@tanstack/react-query-devtools"],
        devDependencies: ["@tanstack/react-query-devtools"],
      }),
    ).toEqual({ missing: ["@tanstack/react-query-devtools"], extra: [] });
  });

  it("ignores a bundled package declared in neither field", () => {
    // Transitive packages (scheduler via react-dom, seroval via the router)
    // are in the bundle and declared nowhere. Don't treat that as extra.
    expect(
      classifyPackages({
        ...base,
        bundled: ["react-dom", "scheduler", "seroval"],
        dependencies: ["react-dom"],
      }),
    ).toEqual({ missing: [], extra: [] });
  });

  it("reports a dependency that never reaches the bundle", () => {
    expect(
      classifyPackages({
        ...base,
        bundled: [],
        dependencies: ["react-timezone-select"],
      }),
    ).toEqual({ missing: [], extra: ["react-timezone-select"] });
  });

  it("exempts a declared runtime peer from the extra check", () => {
    expect(
      classifyPackages({
        ...base,
        bundled: [],
        dependencies: ["@emotion/react"],
        runtimePeers: ["@emotion/react"],
      }),
    ).toEqual({ missing: [], extra: [] });
  });

  it("tolerates a runtime peer that is not declared at all", () => {
    expect(
      classifyPackages({ ...base, runtimePeers: ["@emotion/react"] }),
    ).toEqual({ missing: [], extra: [] });
  });

  it("exempts a bundled transitive devDependency from the missing check", () => {
    expect(
      classifyPackages({
        ...base,
        bundled: ["fixture-lib", "fixture-leaf"],
        dependencies: ["fixture-lib"],
        devDependencies: ["fixture-leaf"],
        transitiveDevs: ["fixture-leaf"],
      }),
    ).toEqual({ missing: [], extra: [] });
  });

  it("reports a bundled transitive devDependency without the allowlist", () => {
    expect(
      classifyPackages({
        ...base,
        bundled: ["fixture-lib", "fixture-leaf"],
        dependencies: ["fixture-lib"],
        devDependencies: ["fixture-leaf"],
      }),
    ).toEqual({ missing: ["fixture-leaf"], extra: [] });
  });

  it("tolerates a transitive dev that is not declared at all", () => {
    expect(
      classifyPackages({ ...base, transitiveDevs: ["fixture-leaf"] }),
    ).toEqual({ missing: [], extra: [] });
  });

  it("treats a package declared in both fields as a dependency", () => {
    expect(
      classifyPackages({
        ...base,
        bundled: ["vite"],
        dependencies: ["vite"],
        devDependencies: ["vite"],
      }),
    ).toEqual({ missing: [], extra: [] });
  });

  it("returns empty lists for empty input", () => {
    expect(classifyPackages(base)).toEqual({ missing: [], extra: [] });
  });
});
