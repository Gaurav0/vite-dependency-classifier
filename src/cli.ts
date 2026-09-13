/**
 * CLI argument parsing and output formatting.
 *
 * The published bin is a thin dispatcher over this module; `check()` stays
 * the library API.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { CheckOptions, CheckResult } from "./runCheck.ts";

export const CLI_NAME = "vite-dependency-classifier";

export type ParsedCli =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "usage"; message: string }
  | {
      kind: "check";
      options: CheckOptions;
      json: boolean;
      quiet: boolean;
    };

export interface FormatFlags {
  json: boolean;
  quiet: boolean;
}

export interface FormattedOutput {
  stdout: string;
  stderr: string;
}

export function helpText(): string {
  return `\
Usage: ${CLI_NAME} [options] [root]

Check that a Vite project's dependencies/devDependencies split matches
what the production build actually contains.

Arguments:
  root                   Project root (default: current directory)

Options:
  -c, --config <file>    Vite config file (default: vite.config.*)
  --input <file>         Entry module when no Vite config is used
  --runtime-peer <name>  Exempt a runtime peer from the extra check
                         (repeatable). Put the reason next to the flag.
  --json                 Print the result as JSON
  -q, --quiet            Print only classification failures
  -h, --help             Show this help
  -v, --version          Show version`;
}

export function packageVersion(): string {
  const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
  return (JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string })
    .version;
}

export function parseCli(argv: string[]): ParsedCli {
  let values: {
    help?: boolean;
    version?: boolean;
    config?: string;
    input?: string;
    "runtime-peer"?: string[];
    json?: boolean;
    quiet?: boolean;
  };
  let positionals: string[];

  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        config: { type: "string", short: "c" },
        input: { type: "string" },
        "runtime-peer": { type: "string", multiple: true },
        json: { type: "boolean" },
        quiet: { type: "boolean", short: "q" },
      },
    }));
  } catch (error) {
    return {
      kind: "usage",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (values.help === true) {
    return { kind: "help" };
  }

  if (values.version === true) {
    return { kind: "version" };
  }

  const extra = positionals[1];
  if (extra !== undefined) {
    return {
      kind: "usage",
      message: `Unexpected argument '${extra}'. Expected at most one project root.`,
    };
  }

  return {
    kind: "check",
    options: {
      root: path.resolve(positionals[0] ?? process.cwd()),
      ...(values.config === undefined
        ? {}
        : { configFile: path.resolve(values.config) }),
      ...(values.input === undefined ? {} : { input: values.input }),
      ...(values["runtime-peer"] === undefined
        ? {}
        : { runtimePeers: values["runtime-peer"] }),
    },
    json: values.json === true,
    quiet: values.quiet === true,
  };
}

export function formatCheckResult(
  result: CheckResult,
  flags: FormatFlags,
): FormattedOutput {
  if (flags.json) {
    return {
      stdout: JSON.stringify({
        ok: result.ok,
        missing: result.missing,
        extra: result.extra,
        packages: [...result.packages].sort(),
        chunkCount: result.chunkCount,
      }),
      stderr: "",
    };
  }

  const stdout: string[] = [];
  const stderr: string[] = [];

  if (!flags.quiet) {
    stdout.push(
      `Built ${String(result.chunkCount)} chunks; ${String(result.packages.size)} packages reached the production bundle.`,
    );
  }

  if (result.missing.length > 0) {
    stderr.push(
      "\nDeclared in devDependencies, but present in the production bundle:",
    );
    for (const name of result.missing) stderr.push(`  ${name}`);
    stderr.push(
      "\nThese ship to users, so they belong in dependencies — or the import\n" +
        "should be removed or guarded. A devDependency that ships is an exposure\n" +
        "that `npm audit --omit=dev` will not show you.",
    );
  }

  if (result.extra.length > 0) {
    stderr.push(
      "\nDeclared in dependencies, but absent from the production bundle:",
    );
    for (const name of result.extra) stderr.push(`  ${name}`);
    stderr.push(
      "\nMove them to devDependencies, or — if a dependency pulls them in at\n" +
        "runtime without our source importing them by name — pass\n" +
        "`--runtime-peer <name>`. Put the reason next to the flag in the\n" +
        "script or CI step that runs this command.",
    );
  }

  if (!result.ok) {
    stderr.push('\nSee README.md ("Dependencies") for the policy.');
  } else if (!flags.quiet) {
    stdout.push("Dependency classification is correct.");
  }

  const stderrText = stderr.join("\n");
  return {
    stdout: stdout.join("\n"),
    stderr: flags.quiet ? stderrText.replace(/^\n/, "") : stderrText,
  };
}
