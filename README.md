# vite-dependency-classifier

Check that a Vite project's `dependencies` / `devDependencies` split matches
what the production build actually contains.

The classification is derived from a real production build, not from a source
scan. That is the point: a source-level check cannot tell that a dev-only
import behind `import.meta.env.DEV` was eliminated, and would flag the pattern
the policy requires.

## Install

```bash
npm install --save-dev vite-dependency-classifier
```

`vite` `^8` is a peer dependency and must already be present.

## CLI

From a Vite project root:

```bash
npx vite-dependency-classifier
npx vite-dependency-classifier /path/to/project
npx vite-dependency-classifier --config vite.config.prod.ts
npx vite-dependency-classifier --json
# @emotion/react: MUI peer, resolved at runtime, never in the bundle by name
npx vite-dependency-classifier --runtime-peer @emotion/react
```

- `-h, --help` — print usage and exit
- `-v, --version` — print the package version and exit
- `-c, --config <file>` — Vite config file (default: the names Vite searches)
- `--input <file>` — entry module, for projects without a Vite config
- `--runtime-peer <name>` — exempt a runtime peer from the extra check (repeatable). Put the reason in a comment next to the flag in the script or CI step that passes it.
- `--json` — print the result as JSON
- `-q, --quiet` — print only classification failures

The command reads that project's `package.json` and Vite config (the same
names Vite searches: `vite.config.js`, `.mjs`, `.ts`, `.cjs`, `.mts`,
`.cts`), runs a production build (nothing is written to disk), and exits
`1` if a declared `devDependency` reached the bundle or a declared
`dependency` did not. A usage error (unknown flag, extra argument) exits
`2`.

The published CLI is compiled JavaScript (`dist/check.js`). A clone can still
run the TypeScript source with Node's type stripper:

```bash
node src/check.ts
```

## Library

```ts
import { check } from "vite-dependency-classifier";

const { ok, missing, extra } = await check();
```

```js
const { check } = require("vite-dependency-classifier");

const { ok, missing, extra } = await check();
```

Pass `runtimePeers` the same way the CLI takes `--runtime-peer`, with the
reason on the line that adds each name.

`collectBundledPackages` and `classifyPackages` are also exported for callers
that want the halves separately.

The published tarball is compiled JavaScript (`dist/`), generated at pack
time. `dist/` is not committed. Installing from a GitHub source tree needs
`npm run build` before `import` / `require` / the bin will resolve.

## Dependencies

`package.json` splits packages into `dependencies` and `devDependencies`. This
package treats that split as follows.

### The definition

A **`dependency`** is anything imported into production code and reachable at
runtime in a user's browser.

Everything else is a **`devDependency`**: build tooling, linters, test
runners, type packages, and anything eliminated from the production bundle.

### Three cases that are not obvious

**A package can be a runtime dependency without being imported by name.** Peer
dependencies pulled in at runtime by a dependency's own code still belong in
`dependencies`. They often reach the bundle under their own names, in which
case this check sees them without help. A package that is required at runtime
and _never_ appears in the bundle under its own name needs an explicit
exemption — `--runtime-peer` on the CLI, or `runtimePeers` on `check()` —
with a stated reason next to that flag or call.

**A dev-only tool imported from a production source file must be behind an
`import.meta.env.DEV` guard**, so the bundler removes it — rather than relying
on the vendor to render nothing in production. A package that ships a no-op
in production builds is still a package the bundler had to resolve; the
guard is what makes the `devDependency` classification true rather than
merely harmless.

**A type-only import is not a runtime dependency.** `import type ...` is
erased at build time and contributes nothing to the bundle, so a package used
only that way belongs in `devDependencies`.

### Why the split matters

It decides which security advisories are urgent. `npm audit --omit=dev` is
only as trustworthy as the classification. A `devDependency` that ships is an
exposure that command will not show you.

### Where the policy is enforced

This package _is_ the check. `missing` is a declared `devDependency` present
in the production bundle. `extra` is a declared `dependency` absent from it.

A bundled package is misclassified only when it is declared on the wrong
side. Transitive packages that appear in the bundle and are declared nowhere
are not reported — they are indistinguishable, at the bundle level, from a
phantom dependency imported by source but listed in neither field. Catching
phantoms needs a source-level import scan, which is a different check.

## Engines

```
"node": "^22.18.0 || ^24.3.0 || >=26.0.0"
```

Vite 8 is `^20.19.0 || >=22.12.0`. This range is narrower on purpose: Node 20
is dropped, and the 22 / 24 floors are the first minors where type stripping
runs without `--experimental-strip-types` or an `ExperimentalWarning`. A clone
needs that for `node src/check.ts`. The published CLI is compiled JavaScript
and would run on Vite's wider range; the engines still follow the source-run
path.

`.npmrc` sets `engine-strict=true`, so `npm install` fails on an unsupported
Node.

## TypeScript

Typecheck runs TypeScript 7 via `@typescript/native` (`node_modules/.bin/tsc`).
The `typescript` package name is aliased to TypeScript 6 so
`typescript-eslint` can keep using the 6.x compiler API.

The tsconfig extends `@tsconfig/strictest` and also turns on
`erasableSyntaxOnly` and `noUncheckedSideEffectImports`. Development
typechecks with `noEmit`. `npm run build` (also `prepack`) emits `dist/` for
the published package.

## Development

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Fixture projects import `fixture-lib` and `fixture-leaf` from
`test/fixtures/packages`, installed at the repo root as `file:`
devDependencies. Vite's walk-up resolution then yields real
`/node_modules/<name>/` module ids.
