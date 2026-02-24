import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  outDir: "dist",
  dts: true,
  clean: true,
  sourcemap: false,
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".js"
    };
  }
});
