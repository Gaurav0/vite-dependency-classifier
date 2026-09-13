import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { helpText, packageVersion, parseCli } from "../src/cli.ts";

const bin = fileURLToPath(new URL("../src/check.ts", import.meta.url));

function spawnCli(...args: string[]) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
}

describe("parseCli", () => {
  it("treats --help and -h as help", () => {
    expect(parseCli(["--help"])).toEqual({ kind: "help" });
    expect(parseCli(["-h"])).toEqual({ kind: "help" });
  });

  it("treats --version and -v as version", () => {
    expect(parseCli(["--version"])).toEqual({ kind: "version" });
    expect(parseCli(["-v"])).toEqual({ kind: "version" });
  });

  it("lets --help beat --version", () => {
    expect(parseCli(["--help", "--version"])).toEqual({ kind: "help" });
    expect(parseCli(["-v", "-h"])).toEqual({ kind: "help" });
  });

  it("accepts --config and a positional root together", () => {
    expect(
      parseCli(["--config", "vite.config.prod.ts", "/tmp/project"]),
    ).toEqual({
      kind: "check",
      options: {
        root: path.resolve("/tmp/project"),
        configFile: path.resolve("vite.config.prod.ts"),
      },
      json: false,
      quiet: false,
    });
  });

  it("collects repeatable --runtime-peer values", () => {
    expect(
      parseCli([
        "--runtime-peer",
        "@emotion/react",
        "--runtime-peer",
        "react-is",
      ]),
    ).toMatchObject({
      kind: "check",
      options: { runtimePeers: ["@emotion/react", "react-is"] },
    });
  });

  it("records --json and --quiet", () => {
    expect(parseCli(["--json", "-q"])).toMatchObject({
      kind: "check",
      json: true,
      quiet: true,
    });
  });

  it("defaults root to cwd when no positional is given", () => {
    expect(parseCli([])).toEqual({
      kind: "check",
      options: { root: path.resolve(process.cwd()) },
      json: false,
      quiet: false,
    });
  });

  it("rejects an unknown flag", () => {
    const parsed = parseCli(["--nope"]);
    expect(parsed.kind).toBe("usage");
    if (parsed.kind === "usage") {
      expect(parsed.message).toMatch(/unknown option '--nope'/i);
    }
  });

  it("rejects a second positional", () => {
    expect(parseCli(["/tmp/a", "/tmp/b"])).toEqual({
      kind: "usage",
      message:
        "Unexpected argument '/tmp/b'. Expected at most one project root.",
    });
  });

  it("rejects --config without a value", () => {
    const parsed = parseCli(["--config"]);
    expect(parsed.kind).toBe("usage");
    if (parsed.kind === "usage") {
      expect(parsed.message).toMatch(/argument missing/i);
    }
  });
});

describe("bin", () => {
  it("prints help and exits 0", () => {
    const result = spawnCli("--help");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${helpText()}\n`);
  });

  it("prints the package version and exits 0", () => {
    const result = spawnCli("--version");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${packageVersion()}\n`);
  });

  it("exits 2 on a usage error", () => {
    const result = spawnCli("--nope");
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/unknown option '--nope'/i);
    expect(result.stderr).toContain(
      "Try 'vite-dependency-classifier --help' for more information.",
    );
  });
});
