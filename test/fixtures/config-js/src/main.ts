// Same as clean, but this fixture has vite.config.js so check() must let
// Vite discover the config instead of assuming vite.config.ts.
import { lib } from "fixture-lib";

(globalThis as Record<string, unknown>).__fixtureValue = lib;
