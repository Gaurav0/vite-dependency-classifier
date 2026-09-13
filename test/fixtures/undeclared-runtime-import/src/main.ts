// DevDependency imported from production source. Should be flagged.
import { lib } from "fixture-lib";

(globalThis as Record<string, unknown>).__fixtureLib = lib;
