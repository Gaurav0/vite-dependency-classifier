# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-09-14

### Added

- `unlisted` finding: first-party production imports listed in none of
  `dependencies`, `devDependencies`, or `optionalDependencies`. Fails
  `ok` and CLI exit `1`. First-party is source under the project root;
  Vite aliases to another package's source are not. Virtual wrappers
  (`\0…`, `virtual:`) and same-package proxies (CommonJS) are hops, not
  first-party.
- `--app` / `--library` (`projectType`). Default is `app`. A library
  also treats `peerDependencies` as declared for `unlisted`.
- `collectBundledPackages` returns `directPackages`.
- Exported `classifyUnlisted`.
- `--json` includes `unlisted` and `projectType`.
- `optionalDependencies` count as declared for `unlisted`.

### Fixed

- CSS-only imports are no longer treated as absent from the production
  bundle. A package imported only as a stylesheet is now collected from
  `renderChunk` (before Vite deletes pure-CSS chunks), so it is not
  reported as `extra` when declared as a `dependency`, and is reported
  as `missing` when declared as a `devDependency`.

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

[unreleased]: https://github.com/Gaurav0/vite-dependency-classifier/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Gaurav0/vite-dependency-classifier/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Gaurav0/vite-dependency-classifier/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Gaurav0/vite-dependency-classifier/releases/tag/v0.1.0
