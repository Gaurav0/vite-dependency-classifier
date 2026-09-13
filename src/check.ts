#!/usr/bin/env node
/**
 * CLI. Parse flags, run `check()`, print, exit.
 */
import {
  CLI_NAME,
  formatCheckResult,
  helpText,
  packageVersion,
  parseCli,
} from "./cli.ts";
import { check } from "./runCheck.ts";

const parsed = parseCli(process.argv.slice(2));

if (parsed.kind === "help") {
  console.log(helpText());
  process.exit(0);
}

if (parsed.kind === "version") {
  console.log(packageVersion());
  process.exit(0);
}

if (parsed.kind === "usage") {
  console.error(parsed.message);
  console.error(`Try '${CLI_NAME} --help' for more information.`);
  process.exit(2);
}

try {
  const result = await check(parsed.options);
  const { stdout, stderr } = formatCheckResult(result, {
    json: parsed.json,
    quiet: parsed.quiet,
  });
  if (stdout !== "") console.log(stdout);
  if (stderr !== "") console.error(stderr);
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
