import { describe, expect, it } from "vitest";
import {
  classifyPackages,
  classifyUnlisted,
  isFirstPartySourceId,
  isVirtualModuleId,
  moduleFilePath,
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

  it("returns null for an unresolved virtual: id", () => {
    expect(packageNameFromModuleId("virtual:my-plugin")).toBeNull();
  });

  it("reads a package name from a CommonJS proxy query", () => {
    expect(
      packageNameFromModuleId(
        "/repo/node_modules/fixture-cjs/index.js?commonjs-proxy",
      ),
    ).toBe("fixture-cjs");
  });
});

describe("isVirtualModuleId", () => {
  it("treats a NUL prefix and virtual: as virtual", () => {
    expect(isVirtualModuleId("\0vite/preload-helper")).toBe(true);
    expect(isVirtualModuleId("virtual:my-plugin")).toBe(true);
    expect(isVirtualModuleId("/repo/src/main.ts")).toBe(false);
  });
});

describe("moduleFilePath", () => {
  it("strips a query string", () => {
    expect(moduleFilePath("/repo/src/App.vue?vue&type=script")).toBe(
      "/repo/src/App.vue",
    );
  });
});

describe("isFirstPartySourceId", () => {
  const root = "/repo";

  it("accepts source under the project root", () => {
    expect(isFirstPartySourceId("/repo/src/main.ts", root)).toBe(true);
  });

  it("accepts a query suffix on first-party source", () => {
    expect(
      isFirstPartySourceId("/repo/src/App.vue?vue&type=script", root),
    ).toBe(true);
  });

  it("rejects a package under node_modules", () => {
    expect(
      isFirstPartySourceId("/repo/node_modules/react/index.js", root),
    ).toBe(false);
  });

  it("rejects a store path that is not a package name", () => {
    expect(
      isFirstPartySourceId(
        "/repo/node_modules/.store/react@19.2.5/index.js",
        root,
      ),
    ).toBe(false);
  });

  it("rejects source outside the project root", () => {
    expect(
      isFirstPartySourceId("/repo-ui/packages/ui/src/index.ts", root),
    ).toBe(false);
  });

  it("rejects virtual modules", () => {
    expect(isFirstPartySourceId("\0vite/preload-helper", root)).toBe(false);
    expect(isFirstPartySourceId("virtual:my-plugin", root)).toBe(false);
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

describe("classifyUnlisted", () => {
  const base = {
    direct: [],
    dependencies: [],
    devDependencies: [],
  };

  it("reports a direct import listed in none of the four fields", () => {
    expect(
      classifyUnlisted({
        ...base,
        direct: ["fixture-lib"],
      }),
    ).toEqual(["fixture-lib"]);
  });

  it("ignores a direct import listed in dependencies", () => {
    expect(
      classifyUnlisted({
        ...base,
        direct: ["fixture-lib"],
        dependencies: ["fixture-lib"],
      }),
    ).toEqual([]);
  });

  it("ignores a direct import listed in devDependencies", () => {
    // Wrong field is `missing`, not unlisted.
    expect(
      classifyUnlisted({
        ...base,
        direct: ["fixture-lib"],
        devDependencies: ["fixture-lib"],
      }),
    ).toEqual([]);
  });

  it("ignores a direct import listed in peerDependencies", () => {
    // Library callers pass peerDependencies. Apps omit the field so a
    // peer-only import is unlisted — see check() / --library.
    expect(
      classifyUnlisted({
        ...base,
        direct: ["fixture-lib"],
        peerDependencies: ["fixture-lib"],
      }),
    ).toEqual([]);
  });

  it("ignores a direct import listed in optionalDependencies", () => {
    expect(
      classifyUnlisted({
        ...base,
        direct: ["fixture-lib"],
        optionalDependencies: ["fixture-lib"],
      }),
    ).toEqual([]);
  });

  it("ignores a direct import listed in both dependencies and devDependencies", () => {
    expect(
      classifyUnlisted({
        ...base,
        direct: ["vite"],
        dependencies: ["vite"],
        devDependencies: ["vite"],
      }),
    ).toEqual([]);
  });

  it("returns sorted unique names for two undeclared direct imports", () => {
    expect(
      classifyUnlisted({
        ...base,
        direct: ["zod", "fixture-lib", "zod"],
      }),
    ).toEqual(["fixture-lib", "zod"]);
  });

  it("returns empty when nothing is direct", () => {
    // Transitives live in `packages`, not `direct`.
    expect(classifyUnlisted(base)).toEqual([]);
  });

  it("ignores a declared name that is not direct", () => {
    expect(
      classifyUnlisted({
        ...base,
        dependencies: ["unused-pkg"],
      }),
    ).toEqual([]);
  });
});
