import { defineConfig } from "vite";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  server: { host: "0.0.0.0", port: 5173 },
  build: { target: "es2022" },
});
