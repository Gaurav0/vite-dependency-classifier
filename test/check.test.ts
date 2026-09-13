import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { check } from "../src/runCheck.ts";

function fixture(name: string) {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

describe("check", () => {
  it("reports ok for a correctly declared fixture", async () => {
    const result = await check({
      root: fixture("clean"),
      configFile: false,
    });

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
    expect(result.packages.has("fixture-lib")).toBe(true);
  });
});
