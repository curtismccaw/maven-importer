import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, the frontend runs on its own port (5173) and proxies /api calls to
// the Express backend on 3000. In production, Express serves the built
// frontend directly from the same origin, so no proxy or CORS is needed at
// all — see server.js.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
  },
});
