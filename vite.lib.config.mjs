import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "font-license",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "fonts/ChicagoKare/LICENSE",
          source: readFileSync(new URL("./src/assets/fonts/LICENSE", import.meta.url), "utf8"),
        });
      },
    },
  ],
  publicDir: false,
  build: {
    outDir: "lib",
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
      cssFileName: "style",
    },
    rollupOptions: {
      external: [/^react(?:\/.*)?$/, /^react-dom(?:\/.*)?$/],
    },
  },
});
