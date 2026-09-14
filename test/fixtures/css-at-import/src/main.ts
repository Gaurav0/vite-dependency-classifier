// CSS @import is inlined by Vite, so the package never becomes a Vite
// module id. Collection has to come from the stylesheet compile.
import "./app.css";

(globalThis as Record<string, unknown>).__cssAtImport = true;
