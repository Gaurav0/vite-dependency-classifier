import { describe, expect, it } from "vitest";
import {
  classifyPackages,
  classifyUnlisted,
  cssImportSpecifiers,
  lessImportSpecifiers,
  isFirstPartySourceId,
  isPreprocessorCssId,
  isVirtualModuleId,
  moduleFilePath,
  packageNameFromCssSpecifier,
  packageNameFromHashImport,
  packageNameFromModuleId,
  packageNameFromSassSpecifier,
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

describe("packageNameFromSassSpecifier", () => {
  it("reads a package name from a bare @use specifier", () => {
    expect(packageNameFromSassSpecifier("bulma/sass/utilities")).toBe("bulma");
  });

  it("keeps the scope on a scoped package", () => {
    expect(packageNameFromSassSpecifier("@acme/theme/colors")).toBe(
      "@acme/theme",
    );
  });

  it("strips the pkg: Node package importer prefix", () => {
    expect(packageNameFromSassSpecifier("pkg:bulma")).toBe("bulma");
    expect(packageNameFromSassSpecifier("pkg:@acme/theme/colors")).toBe(
      "@acme/theme",
    );
  });

  it("returns null for relative paths, builtins, and other URLs", () => {
    expect(packageNameFromSassSpecifier("./partial")).toBeNull();
    expect(packageNameFromSassSpecifier("../theme")).toBeNull();
    expect(packageNameFromSassSpecifier("/abs/file.scss")).toBeNull();
    expect(packageNameFromSassSpecifier("sass:math")).toBeNull();
    expect(packageNameFromSassSpecifier("file:///tmp/x.scss")).toBeNull();
  });

  it("returns null for a Vite @/ alias", () => {
    expect(packageNameFromSassSpecifier("@/theme")).toBeNull();
    expect(packageNameFromSassSpecifier("@/styles/colors")).toBeNull();
  });
});

describe("packageNameFromCssSpecifier", () => {
  it("reads a package name from a bare subpath", () => {
    expect(packageNameFromCssSpecifier("bulma/css/bulma.css")).toBe("bulma");
  });

  it("keeps a dotted package name", () => {
    expect(packageNameFromCssSpecifier("normalize.css")).toBe("normalize.css");
  });

  it("keeps the scope on a scoped package", () => {
    expect(packageNameFromCssSpecifier("@acme/theme/base.css")).toBe(
      "@acme/theme",
    );
  });

  it("unwraps url() with double quotes, single quotes, and none", () => {
    expect(packageNameFromCssSpecifier('url("open-props")')).toBe("open-props");
    expect(packageNameFromCssSpecifier("url('open-props')")).toBe("open-props");
    expect(packageNameFromCssSpecifier("url(open-props)")).toBe("open-props");
  });

  it("returns null for relative paths, absolute paths, and other URLs", () => {
    expect(packageNameFromCssSpecifier("./partial.css")).toBeNull();
    expect(packageNameFromCssSpecifier("../theme")).toBeNull();
    expect(packageNameFromCssSpecifier("/abs/file.css")).toBeNull();
    expect(
      packageNameFromCssSpecifier("https://fonts.example/x.css"),
    ).toBeNull();
    expect(
      packageNameFromCssSpecifier('url("https://fonts.example/x.css")'),
    ).toBeNull();
    expect(
      packageNameFromCssSpecifier("data:text/css,body{color:red}"),
    ).toBeNull();
    expect(packageNameFromCssSpecifier("//example.com/x.css")).toBeNull();
  });

  it("returns null for a Vite @/ alias", () => {
    expect(packageNameFromCssSpecifier("@/theme.css")).toBeNull();
    expect(packageNameFromCssSpecifier("@/styles/theme.css")).toBeNull();
  });

  it("returns null for a #imports specifier", () => {
    expect(packageNameFromCssSpecifier("#internal/x.css")).toBeNull();
  });
});

describe("packageNameFromHashImport", () => {
  it("reads a package from an exact imports mapping", () => {
    expect(
      packageNameFromHashImport("#theme", {
        "#theme": "fixture-css-theme/index.css",
      }),
    ).toBe("fixture-css-theme");
  });

  it("reads a package from a conditional imports mapping", () => {
    expect(
      packageNameFromHashImport("#theme", {
        "#theme": { default: "fixture-css-theme/index.css" },
      }),
    ).toBe("fixture-css-theme");
  });

  it("returns null when the mapping is a relative file", () => {
    expect(
      packageNameFromHashImport("#theme", { "#theme": "./src/theme.css" }),
    ).toBeNull();
  });

  it("returns null when the specifier is missing from imports", () => {
    expect(packageNameFromHashImport("#theme", { "#other": "pkg" })).toBeNull();
    expect(packageNameFromHashImport("#theme", undefined)).toBeNull();
  });
});

describe("cssImportSpecifiers", () => {
  it("reads a double-quoted @import", () => {
    expect(cssImportSpecifiers('@import "pkg";')).toEqual(["pkg"]);
  });

  it("reads a single-quoted @import", () => {
    expect(cssImportSpecifiers("@import 'pkg';")).toEqual(["pkg"]);
  });

  it("reads a url() @import", () => {
    expect(cssImportSpecifiers('@import url("pkg");')).toEqual(["pkg"]);
  });

  it("strips layer() and media queries after the specifier", () => {
    expect(cssImportSpecifiers('@import "pkg" layer(base);')).toEqual(["pkg"]);
    expect(cssImportSpecifiers('@import "pkg" print;')).toEqual(["pkg"]);
    expect(cssImportSpecifiers('@import "pkg" layer(base) print;')).toEqual([
      "pkg",
    ]);
  });

  it("returns two @imports in source order", () => {
    expect(cssImportSpecifiers('@import "first";\n@import "second";')).toEqual([
      "first",
      "second",
    ]);
  });

  it("yields an https URL so the name helper can reject it", () => {
    expect(
      cssImportSpecifiers('@import url("https://example.com/x.css");'),
    ).toEqual(["https://example.com/x.css"]);
    expect(packageNameFromCssSpecifier("https://example.com/x.css")).toBeNull();
  });

  it("ignores @import in a block comment", () => {
    expect(
      cssImportSpecifiers('/* @import "bootstrap"; */\n@import "pkg";'),
    ).toEqual(["pkg"]);
  });

  it("ignores @import inside a quoted string", () => {
    expect(
      cssImportSpecifiers(
        '.x{content:"@import \\"bootstrap\\"";}\n@import "pkg";',
      ),
    ).toEqual(["pkg"]);
  });

  it("reads @import when a comment sits between the keyword and specifier", () => {
    expect(cssImportSpecifiers('@import /* note */ "pkg";')).toEqual(["pkg"]);
    expect(cssImportSpecifiers('@import /* note */ url("pkg");')).toEqual([
      "pkg",
    ]);
    expect(cssImportSpecifiers("@import url(/* x */ 'pkg' /* y */);")).toEqual([
      "pkg",
    ]);
  });
});

describe("lessImportSpecifiers", () => {
  it("reads a double-quoted @import", () => {
    expect(lessImportSpecifiers('@import "pkg";')).toEqual(["pkg"]);
  });

  it("reads a single-quoted @import", () => {
    expect(lessImportSpecifiers("@import 'pkg';")).toEqual(["pkg"]);
  });

  it("reads a url() @import", () => {
    expect(lessImportSpecifiers('@import url("pkg");')).toEqual(["pkg"]);
  });

  it("returns two @imports in source order", () => {
    expect(lessImportSpecifiers('@import "first";\n@import "second";')).toEqual(
      ["first", "second"],
    );
  });

  it("ignores @import in a line comment", () => {
    expect(lessImportSpecifiers('// @import "pkg";\n@import "other";')).toEqual(
      ["other"],
    );
  });

  it("ignores @import in a block comment", () => {
    expect(
      lessImportSpecifiers('/* @import "bootstrap"; */\n@import "pkg";'),
    ).toEqual(["pkg"]);
  });

  it("skips a parenthesized option list so it is not the specifier", () => {
    expect(lessImportSpecifiers('@import (reference) "pkg";')).toEqual(["pkg"]);
  });

  it("ignores @plugin", () => {
    expect(lessImportSpecifiers('@plugin "pkg";')).toEqual([]);
  });

  it("yields a relative path so the name helper can reject it", () => {
    expect(lessImportSpecifiers('@import "./x";')).toEqual(["./x"]);
    expect(packageNameFromCssSpecifier("./x")).toBeNull();
    expect(packageNameFromCssSpecifier("pkg")).toBe("pkg");
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

describe("isPreprocessorCssId", () => {
  it("matches a standalone preprocessor file", () => {
    expect(isPreprocessorCssId("/repo/src/theme.scss")).toBe(true);
    expect(isPreprocessorCssId("/repo/src/theme.sass")).toBe(true);
    expect(isPreprocessorCssId("/repo/src/theme.less")).toBe(true);
    expect(isPreprocessorCssId("/repo/src/theme.styl")).toBe(true);
    expect(isPreprocessorCssId("/repo/src/theme.stylus")).toBe(true);
  });

  it("matches a preprocessor file with a Vite query", () => {
    expect(isPreprocessorCssId("/repo/src/theme.scss?direct")).toBe(true);
  });

  it("matches a Vue/Svelte style block whose lang is on the query", () => {
    expect(
      isPreprocessorCssId("/repo/src/App.vue?vue&type=style&index=0&lang.scss"),
    ).toBe(true);
    expect(
      isPreprocessorCssId(
        "/repo/src/App.vue?vue&type=style&index=0&scoped=abc&lang.scss",
      ),
    ).toBe(true);
    expect(
      isPreprocessorCssId(
        "/repo/src/Widget.svelte?svelte&type=style&lang.scss",
      ),
    ).toBe(true);
  });

  it("rejects plain CSS, including a Vue/Svelte CSS style block", () => {
    expect(isPreprocessorCssId("/repo/src/app.css")).toBe(false);
    expect(
      isPreprocessorCssId("/repo/src/App.vue?vue&type=style&index=0&lang.css"),
    ).toBe(false);
    expect(
      isPreprocessorCssId("/repo/src/Widget.svelte?svelte&type=style&lang.css"),
    ).toBe(false);
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

  it("reports a direct import listed in none of the declared fields", () => {
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
