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
    expect(result.unlisted).toEqual([]);
    expect(result.packages.has("fixture-lib")).toBe(true);
  });

  it("reports ok for a CSS-only declared dependency", async () => {
    const result = await check({
      root: fixture("css-only-import"),
      configFile: false,
    });

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
    expect(result.unlisted).toEqual([]);
    expect(result.packages.has("fixture-css")).toBe(true);
  });

  it("reports ok for a Sass-only declared dependency", async () => {
    const result = await check({
      root: fixture("sass-only-import"),
      configFile: false,
    });

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
    expect(result.unlisted).toEqual([]);
    expect(result.packages.has("fixture-sass")).toBe(true);
  });

  it("reports ok for a CSS @import declared dependency", async () => {
    const result = await check({
      root: fixture("css-at-import"),
      configFile: false,
    });

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
    expect(result.unlisted).toEqual([]);
    expect(result.packages.has("fixture-css-theme")).toBe(true);
  });

  it("exempts a transitive-only devDependency passed as transitiveDevs", async () => {
    const root = fixture("transitive-dev");

    const without = await check({
      root,
      configFile: false,
    });
    expect(without.ok).toBe(false);
    expect(without.missing).toEqual(["fixture-leaf"]);
    expect(without.unlisted).toEqual([]);

    const withAllowlist = await check({
      root,
      configFile: false,
      transitiveDevs: ["fixture-leaf"],
    });
    expect(withAllowlist.ok).toBe(true);
    expect(withAllowlist.missing).toEqual([]);
    expect(withAllowlist.unlisted).toEqual([]);
  });

  it("discovers vite.config.js when configFile is omitted", async () => {
    const result = await check({
      root: fixture("config-js"),
    });

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
    expect(result.unlisted).toEqual([]);
    expect(result.packages.has("fixture-lib")).toBe(true);
  });

  it("reports a first-party import listed in none of the app fields", async () => {
    const result = await check({
      root: fixture("unlisted-import"),
      configFile: false,
    });

    expect(result.ok).toBe(false);
    expect(result.unlisted).toEqual(["fixture-lib"]);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
  });

  it("reports a production import of a devDependency as missing, not unlisted", async () => {
    const result = await check({
      root: fixture("undeclared-runtime-import"),
      configFile: false,
    });

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["fixture-lib"]);
    expect(result.unlisted).toEqual([]);
  });

  it("treats a first-party import declared only as a peerDependency as unlisted for an app", async () => {
    const result = await check({
      root: fixture("peer-import"),
      configFile: false,
    });

    expect(result.projectType).toBe("app");
    expect(result.ok).toBe(false);
    expect(result.unlisted).toEqual(["fixture-lib"]);
  });

  it("treats a first-party import declared only as a peerDependency as listed for a library", async () => {
    const result = await check({
      root: fixture("peer-import"),
      configFile: false,
      projectType: "library",
    });

    expect(result.projectType).toBe("library");
    expect(result.ok).toBe(true);
    expect(result.unlisted).toEqual([]);
  });

  it("treats a first-party import declared only as an optionalDependency as listed", async () => {
    const result = await check({
      root: fixture("optional-import"),
      configFile: false,
    });

    expect(result.ok).toBe(true);
    expect(result.unlisted).toEqual([]);
  });

  it("reports a first-party CommonJS import listed in none of the app fields", async () => {
    const result = await check({
      root: fixture("cjs-unlisted-import"),
      configFile: false,
    });

    expect(result.ok).toBe(false);
    expect(result.unlisted).toEqual(["fixture-cjs"]);
  });

  it("does not report deps of source aliased from outside the project root", async () => {
    const result = await check({
      root: fixture("aliased-workspace"),
    });

    expect(result.ok).toBe(true);
    expect(result.unlisted).toEqual([]);
    expect(result.packages.has("fixture-leaf")).toBe(true);
  });
});
