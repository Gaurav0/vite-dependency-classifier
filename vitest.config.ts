import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Fixture tests run real production builds; the default 5s is not enough.
    testTimeout: 30_000,
  },
});
