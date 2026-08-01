import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["workbench/tests/**/*.test.ts"], environment: "node" },
});
