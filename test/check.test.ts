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

  it("exempts a transitive-only devDependency passed as transitiveDevs", async () => {
    const root = fixture("transitive-dev");

    const without = await check({
      root,
      configFile: false,
    });
    expect(without.ok).toBe(false);
    expect(without.missing).toEqual(["fixture-leaf"]);

    const withAllowlist = await check({
      root,
      configFile: false,
      transitiveDevs: ["fixture-leaf"],
    });
    expect(withAllowlist.ok).toBe(true);
    expect(withAllowlist.missing).toEqual([]);
  });

  it("discovers vite.config.js when configFile is omitted", async () => {
    const result = await check({
      root: fixture("config-js"),
    });

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
    expect(result.packages.has("fixture-lib")).toBe(true);
  });
});
