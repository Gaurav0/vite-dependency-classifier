// @import "@/theme.css" is a Vite alias, not a package. Vite resolves it
// and addWatchFile sees the first-party file; collection walks that.
import "./app.css";

(globalThis as Record<string, unknown>).__cssAtImportAlias = true;
