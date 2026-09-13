/// <reference types="vite/client" />

// Same as undeclared-runtime-import, but behind import.meta.env.DEV.
// Vite sets that to false in production, so this should vanish from the bundle.
//
// Dynamic import, not top-level await — some targets reject TLA.
if (import.meta.env.DEV) {
  void import("fixture-lib").then((m) => {
    (globalThis as Record<string, unknown>).__fixtureLib = m.lib;
  });
}
