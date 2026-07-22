import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/india-china-dependency-atlas-2026/",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
