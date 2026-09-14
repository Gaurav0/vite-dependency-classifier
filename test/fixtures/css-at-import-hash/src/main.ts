// @import "#theme" is a Node #imports mapping to a package, not a
// relative file. Collection reads package.json imports so it is direct.
import "./app.css";

(globalThis as Record<string, unknown>).__cssAtImportHash = true;
