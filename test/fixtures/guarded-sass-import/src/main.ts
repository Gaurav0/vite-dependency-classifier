/// <reference types="vite/client" />

// Same as sass-only-import, but behind import.meta.env.DEV.
if (import.meta.env.DEV) {
  void import("./dev.scss");
}

(globalThis as Record<string, unknown>).__guardedSass = true;
