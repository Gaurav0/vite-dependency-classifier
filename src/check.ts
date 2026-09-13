#!/usr/bin/env node
/**
 * CLI. Run from a Vite project root; an optional path overrides cwd.
 */
import path from "node:path";
import { check } from "./runCheck.ts";

const result = await check({
  root: path.resolve(process.argv[2] ?? process.cwd()),
});

console.log(
  `Built ${String(result.chunkCount)} chunks; ${String(result.packages.size)} packages reached the production bundle.`,
);

if (result.missing.length > 0) {
  console.error(
    "\nDeclared in devDependencies, but present in the production bundle:",
  );
  for (const name of result.missing) console.error(`  ${name}`);
  console.error(
    "\nThese ship to users, so they belong in dependencies — or the import\n" +
      "should be removed or guarded. A devDependency that ships is an exposure\n" +
      "that `npm audit --omit=dev` will not show you.",
  );
}

if (result.extra.length > 0) {
  console.error(
    "\nDeclared in dependencies, but absent from the production bundle:",
  );
  for (const name of result.extra) console.error(`  ${name}`);
  console.error(
    "\nMove them to devDependencies, or — if a dependency pulls them in at\n" +
      "runtime without our source importing them by name — pass them as\n" +
      "`runtimePeers` to `check()`, with the reason.",
  );
}

if (!result.ok) {
  console.error('\nSee README.md ("Dependencies") for the policy.');
  process.exit(1);
}

console.log("Dependency classification is correct.");
