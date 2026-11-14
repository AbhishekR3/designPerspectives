import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The build goes into the Python package so `pip install` ships the UI and users never need Node.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../src/designperspectives/static",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  server: {
    proxy: { "/api": "http://127.0.0.1:8765" },
  },
});
