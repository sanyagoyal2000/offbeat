import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  // One local SQLite file (file:./test.db) shared by all files, so files run one at a time.
  test: { include: ["src/**/*.test.ts"], globalSetup: ["./test/global-setup.ts"], setupFiles: ["./test/setup.ts"], fileParallelism: false },
});
