import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it } from "vitest";
import {
  ensureWatchFileIntercept,
  restoreWatchFileIntercept,
  type WatchFileHost,
  type WatchFileIntercept,
} from "../src/watchFileIntercept.ts";

describe("ensureWatchFileIntercept", () => {
  it("keeps overlapping transforms' watch files on the ALS stylesheet", async () => {
    const als = new AsyncLocalStorage<string>();
    const byStylesheet = new Map<string, string[]>();
    const forwarded: string[] = [];
    const original = (file: string): void => {
      forwarded.push(file);
    };
    const host: WatchFileHost = { addWatchFile: original };

    const record = (file: string): void => {
      const stylesheet = als.getStore();
      if (stylesheet === undefined) {
        return;
      }
      const files = byStylesheet.get(stylesheet) ?? [];
      files.push(file);
      byStylesheet.set(stylesheet, files);
    };

    let intercept: WatchFileIntercept | null = null;
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    async function transform(id: string, file: string): Promise<void> {
      await als.run(id, async () => {
        intercept = ensureWatchFileIntercept(host, record, intercept);
        await gate;
        host.addWatchFile(file);
      });
    }

    const first = transform("a.css", "/repo/node_modules/pkg-a/x.css");
    const second = transform("b.css", "/repo/node_modules/pkg-b/x.css");
    await Promise.resolve();
    release();
    await Promise.all([first, second]);

    expect(byStylesheet.get("a.css")).toEqual([
      "/repo/node_modules/pkg-a/x.css",
    ]);
    expect(byStylesheet.get("b.css")).toEqual([
      "/repo/node_modules/pkg-b/x.css",
    ]);
    expect(forwarded).toHaveLength(2);
    expect(new Set(forwarded)).toEqual(
      new Set([
        "/repo/node_modules/pkg-a/x.css",
        "/repo/node_modules/pkg-b/x.css",
      ]),
    );

    restoreWatchFileIntercept(intercept);
    expect(host.addWatchFile).toBe(original);
  });

  it("does not replace an existing wrap", () => {
    const host: WatchFileHost = {
      addWatchFile: (): void => undefined,
    };
    const first = ensureWatchFileIntercept(host, () => undefined, null);
    const wrapped = host.addWatchFile;
    const second = ensureWatchFileIntercept(host, () => undefined, first);

    expect(second).toBe(first);
    expect(host.addWatchFile).toBe(wrapped);

    restoreWatchFileIntercept(first);
  });
});
