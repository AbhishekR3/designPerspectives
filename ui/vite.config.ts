import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The build goes into ../static, which ships in the npm package, so users never build the UI.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../static",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    // Readable, fixed file names (no content hash): the server makes the browser revalidate them (ETag).
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: (chunk) => (chunk.name.startsWith("elk") ? "assets/diagram-layout.js" : "assets/[name].js"),
        assetFileNames: (asset) => (asset.names.some((n) => n.endsWith(".css")) ? "assets/app[extname]" : "assets/[name][extname]"),
      },
    },
  },
  server: {
    // The UI imports the API types from ../src/shared.
    fs: { allow: [".."] },
    proxy: { "/api": "http://127.0.0.1:8765" },
  },
});
