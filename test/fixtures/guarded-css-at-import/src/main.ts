/// <reference types="vite/client" />

// Same as css-at-import, but behind import.meta.env.DEV.
if (import.meta.env.DEV) {
  void import("./dev.css");
}

(globalThis as Record<string, unknown>).__guardedCssAtImport = true;
