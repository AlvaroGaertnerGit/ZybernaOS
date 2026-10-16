import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    alias: { "server-only": new URL("./tests/server-only-stub.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") },
  },
});
