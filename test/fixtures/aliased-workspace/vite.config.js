import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default {
  resolve: {
    alias: {
      "@workspace/ui": path.resolve(
        dir,
        "../aliased-workspace-ui/src/index.ts",
      ),
    },
  },
  build: {
    rollupOptions: {
      input: "src/main.ts",
    },
  },
};
