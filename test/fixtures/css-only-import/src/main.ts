// CSS-only package. Vite extracts the stylesheet into an asset, so this
// must still count as bundled even though it never appears in a JS chunk.
import "fixture-css";

(globalThis as Record<string, unknown>).__cssOnly = true;
