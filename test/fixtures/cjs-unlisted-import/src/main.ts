// CommonJS package, listed in none of the four package.json fields.
import * as fixtureCjs from "fixture-cjs";

(globalThis as Record<string, unknown>).__fixtureCjs = fixtureCjs;
