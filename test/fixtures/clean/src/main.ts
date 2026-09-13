// Declared dep plus a transitive one (fixture-leaf) that isn't declared.
//
// Assigned to a global so Vite doesn't tree-shake it — app builds use
// preserveEntrySignatures: false, so an unused export disappears.
import { lib } from "fixture-lib";

(globalThis as Record<string, unknown>).__fixtureValue = lib;
