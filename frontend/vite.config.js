import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // During `npm run dev:frontend`, forward API calls to the Express
      // server started separately with `npm run dev:server`.
      "/api": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
  },
});
