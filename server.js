import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import uploadRoutes from "./src/routes/upload.js";
import previewRoutes from "./src/routes/preview.js";
import pushRoutes from "./src/routes/push.js";
import exportRoutes from "./src/routes/export.js";
import { getShopInfo } from "./src/shopifyClient.js";
import { BRANDS } from "./src/grouping/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.join(__dirname, "frontend", "dist");
const IMAGES_ROOT = path.join(__dirname, "data", "images");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Serves zip-extracted brand images so Shopify's product-image fetch can
// reach them. This only works once PUBLIC_BASE_URL (see .env.example)
// points at this app's real, reachable address — see preview.js for the
// check that enforces this before it silently produces broken image URLs.
app.use("/local-images", express.static(IMAGES_ROOT));

app.get("/api/health", async (req, res) => {
  res.json({ ok: true, brands: BRANDS });
});

// Confirms the Shopify credentials actually work end-to-end — run this
// first after setting up .env, before touching any brand files.
app.get("/api/shopify-check", async (req, res) => {
  try {
    const shop = await getShopInfo();
    res.json({ ok: true, shop });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.use("/api", uploadRoutes);
app.use("/api", previewRoutes);
app.use("/api", pushRoutes);
app.use("/api", exportRoutes);

// Serve the built frontend if it exists (run `npm run build` inside
// frontend/ first). In dev, run the frontend separately with
// `npm run dev` (Vite on :5173, proxying /api to this server on :3000)
// instead of relying on this block.
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get("*", (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.type("text/plain").send(
      "Frontend not built yet. Run:\n  cd frontend && npm install && npm run build\nthen restart this server. Until then, the API is still available under /api/*."
    );
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Maven importer backend listening on http://localhost:${port}`);
  console.log(`Try: curl http://localhost:${port}/api/shopify-check`);
});
