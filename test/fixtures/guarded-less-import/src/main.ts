/// <reference types="vite/client" />

// Same as less-only-import, but behind import.meta.env.DEV.
if (import.meta.env.DEV) {
  void import("./dev.less");
}

(globalThis as Record<string, unknown>).__guardedLess = true;
