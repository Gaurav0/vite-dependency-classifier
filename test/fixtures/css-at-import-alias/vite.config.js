import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default {
  resolve: {
    alias: {
      "@": path.resolve(dir, "src"),
    },
  },
  build: {
    rollupOptions: {
      input: "src/main.ts",
    },
  },
};
