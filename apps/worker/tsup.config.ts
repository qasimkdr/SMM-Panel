import { defineConfig } from "tsup";

// Bundle our workspace packages (TypeScript source) into the output; keep npm deps external.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  skipNodeModulesBundle: true,
  noExternal: [/^@smm\//],
});
