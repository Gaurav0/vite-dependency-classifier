// Less @import is inlined by the preprocessor, so the package never becomes
// a Vite module id. Collection has to come from the stylesheet source.
import "./app.less";

(globalThis as Record<string, unknown>).__lessOnly = true;
