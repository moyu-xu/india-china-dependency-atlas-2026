// @ts-nocheck
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export default defineConfig({
  base: "/india-china-dependency-atlas-2026/",
  plugins: [
    react(),
    {
      name: "github-pages-spa-fallback",
      closeBundle() {
        const indexPath = resolve("dist", "index.html");
        const fallbackPath = resolve("dist", "404.html");
        if (existsSync(indexPath)) {
          copyFileSync(indexPath, fallbackPath);
        }
      },
    },
  ],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
