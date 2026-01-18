import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/start.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  target: "node18",
  external: ["react", "ink"],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
