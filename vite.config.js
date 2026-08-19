import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: path.resolve("renderer"),
  base: "./",
  build: {
    outDir: path.resolve("dist/renderer"),
    emptyOutDir: true,
  },
  optimizeDeps: {
    include: ["butterchurn", "butterchurn-presets"],
    needsInterop: ["butterchurn", "butterchurn-presets"],
  },
});
