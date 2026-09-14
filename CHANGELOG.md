# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-09-13

### Added

- `--transitive-dev` / `transitiveDevs` to exempt a correctly declared
  `devDependency` whose production-bundle presence is only transitive. A
  `missing` failure now points at that flag instead of only saying to move
  the package to `dependencies`.

## [0.1.0] - 2026-09-13

Initial release. Classification comes from a real production Vite build, not a
source scan, so an `import.meta.env.DEV` guard that the bundler eliminates is
not treated as a runtime dependency.

### Added

- CLI (`vite-dependency-classifier`) that reads a project's `package.json` and
  Vite config, runs a production build with nothing written to disk, and
  reports `devDependencies` that reached the bundle (`missing`) and
  `dependencies` that did not (`extra`).
- Library exports: `check`, `collectBundledPackages`, `classifyPackages`. ESM
  and CommonJS entry points; the published tarball is compiled JavaScript.
- CLI flags: `-h`/`--help`, `-v`/`--version`, `-c`/`--config`, `--input`,
  `--runtime-peer`, `--json`, `-q`/`--quiet`. A usage error exits `2`.
- Vite config discovery using the same names Vite searches
  (`vite.config.js`, `.mjs`, `.ts`, `.cjs`, `.mts`, `.cts`). `--input` covers
  projects that have no config.
- `--runtime-peer` / `runtimePeers` to exempt a package that is required at
  runtime but never appears in the bundle under its own name.
- Node engines `^22.18.0 || ^24.3.0 || >=26.0.0`. Vite `^8` is a peer
  dependency.
- CI on Node 22, 24, and 26. `npm publish` runs `prepublishOnly` (`npm test`)
  so a red tree cannot ship.

[unreleased]: https://github.com/Gaurav0/vite-dependency-classifier/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Gaurav0/vite-dependency-classifier/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Gaurav0/vite-dependency-classifier/releases/tag/v0.1.0
