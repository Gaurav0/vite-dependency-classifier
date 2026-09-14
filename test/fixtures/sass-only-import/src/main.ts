// Sass @use is inlined by the preprocessor, so the package never becomes
// a Vite module id. Collection has to come from the Sass importer.
import "./app.scss";

(globalThis as Record<string, unknown>).__sassOnly = true;
