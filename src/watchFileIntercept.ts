/**
 * Patch `addWatchFile` once per production build.
 *
 * `vite:css` transforms share one plugin context. Wrapping and restoring
 * per transform races: a later wrap steals the hook, and an earlier restore
 * is a no-op or drops the wrap while the other compile is still running.
 * Nested CSS `@import` packages only arrive through that hook.
 *
 * Record through AsyncLocalStorage so overlapping transforms still land on
 * the stylesheet that is compiling. Restore after `build()` returns.
 */

export interface WatchFileHost {
  addWatchFile: (id: string) => void;
}

export interface WatchFileIntercept {
  host: WatchFileHost;
  original: (id: string) => void;
}

export function ensureWatchFileIntercept(
  host: WatchFileHost,
  record: (file: string) => void,
  existing: WatchFileIntercept | null,
): WatchFileIntercept | null {
  if (existing !== null) {
    return existing;
  }
  const original = host.addWatchFile;
  if (typeof original !== "function") {
    return null;
  }
  const wrapped = (file: string): void => {
    record(file);
    original.call(host, file);
  };
  try {
    host.addWatchFile = wrapped;
  } catch {
    return null;
  }
  return { host, original };
}

export function restoreWatchFileIntercept(
  intercept: WatchFileIntercept | null,
): void {
  if (intercept === null) {
    return;
  }
  intercept.host.addWatchFile = intercept.original;
}
