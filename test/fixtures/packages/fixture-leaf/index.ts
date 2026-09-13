export const leaf = "leaf";

// Keeps this module in the graph so the collector can see its package name.
(globalThis as Record<string, unknown>).__fixtureLeaf = leaf;
