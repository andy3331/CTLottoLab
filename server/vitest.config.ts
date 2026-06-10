import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
  },
});
