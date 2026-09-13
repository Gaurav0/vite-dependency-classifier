// Dynamic import → separate async chunk. A collector that only looks at
// entry chunks would miss this.
//
// Assigned to a global so Vite doesn't tree-shake the unused export
// (preserveEntrySignatures: false on app builds).
void import("fixture-lib").then((m) => {
  (globalThis as Record<string, unknown>).__fixtureLib = m.lib;
});
