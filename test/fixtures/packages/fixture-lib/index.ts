import { leaf } from "fixture-leaf";

/** Owned by this package, not re-exported from fixture-leaf. */
export type Lib = { kind: "lib" };

export const lib = leaf;

// Keeps this module in the graph so the collector can see its package name.
(globalThis as Record<string, unknown>).__fixtureLib = lib;
