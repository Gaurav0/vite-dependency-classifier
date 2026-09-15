import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  importViteFromProject,
  resolveViteFromProject,
} from "../src/importVite.ts";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function emptyProject(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "vdc-vite-"));
  dirs.push(root);
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "app", private: true }),
  );
  return root;
}

async function projectWithVite(version: string): Promise<string> {
  const root = await emptyProject();
  const viteDir = path.join(root, "node_modules", "vite");
  await mkdir(viteDir, { recursive: true });
  await writeFile(
    path.join(viteDir, "package.json"),
    JSON.stringify({
      name: "vite",
      version,
      type: "module",
      exports: {
        ".": "./index.js",
        "./package.json": "./package.json",
      },
    }),
  );
  await writeFile(
    path.join(viteDir, "index.js"),
    `export const version = ${JSON.stringify(version)};\nexport function build() {}\n`,
  );
  return root;
}

describe("resolveViteFromProject", () => {
  it("resolves the vite next to that project's package.json, not this package", async () => {
    const root = await projectWithVite("8.99.0");
    const vitePath = resolveViteFromProject(root);
    const realRoot = await realpath(root);

    expect(vitePath.startsWith(realRoot + path.sep)).toBe(true);
    expect(vitePath).not.toContain(
      path.join("vite-dependency-classifier", "node_modules", "vite"),
    );
  });

  it("walks up from a fixture to this repo's Vite 8", () => {
    const fixture = fileURLToPath(new URL("./fixtures/clean", import.meta.url));
    const vitePath = resolveViteFromProject(fixture);
    expect(vitePath).toContain(
      `${path.sep}node_modules${path.sep}vite${path.sep}`,
    );
  });

  it("fails when that project has no vite", async () => {
    const root = await emptyProject();
    expect(() => resolveViteFromProject(root)).toThrow(/Cannot resolve vite/);
  });

  it("fails when that project's vite is not ^8", async () => {
    const root = await projectWithVite("5.4.19");
    expect(() => resolveViteFromProject(root)).toThrow(/is not \^8/);
  });
});

describe("importViteFromProject", () => {
  it("loads that project's vite module", async () => {
    const root = await projectWithVite("8.99.0");
    const vite = await importViteFromProject(root);
    expect(typeof vite.build).toBe("function");
    expect((vite as unknown as { version: string }).version).toBe("8.99.0");
  });
});
