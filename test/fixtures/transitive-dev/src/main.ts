// fixture-lib ships and pulls in fixture-leaf. fixture-leaf is also a
// declared devDependency — the #3 shape. Production source does not
// import fixture-leaf.
//
// Assigned to a global so Vite doesn't tree-shake it — app builds use
// preserveEntrySignatures: false, so an unused export disappears.
import { lib } from "fixture-lib";

(globalThis as Record<string, unknown>).__fixtureValue = lib;
