// Production import listed in none of the four package.json fields.
// Resolves via the repo-root file: install (hoisted phantom).
import { lib } from "fixture-lib";

(globalThis as Record<string, unknown>).__fixtureLib = lib;
