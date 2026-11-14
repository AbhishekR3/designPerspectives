import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The build goes into ../static, which ships in the npm package, so users never build the UI.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../static",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  server: {
    // The UI imports the API types from ../src/shared.
    fs: { allow: [".."] },
    proxy: { "/api": "http://127.0.0.1:8765" },
  },
});
