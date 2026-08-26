import "dotenv/config";
import express from "express";
import cors from "cors";
import uploadRoutes from "./src/routes/upload.js";
import previewRoutes from "./src/routes/preview.js";
import pushRoutes from "./src/routes/push.js";
import { getShopInfo } from "./src/shopifyClient.js";
import { BRANDS } from "./src/grouping/index.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Maven importer backend listening on http://localhost:${port}`);
  console.log(`Try: curl http://localhost:${port}/api/shopify-check`);
});
