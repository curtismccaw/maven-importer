import { Router } from "express";
import { buildCsvRows, toCsvString } from "../csvExport.js";
import { get } from "../storage/store.js";

const router = Router();

// GET /api/export/:uploadId?indexes=0,1,2
// Omitting `indexes` exports every product from the last /api/preview run.
router.get("/export/:uploadId", (req, res) => {
  const { uploadId } = req.params;
  const preview = get("previews", uploadId);
  if (!preview) return res.status(404).json({ error: "No preview found for this uploadId. Run /api/preview first." });

  let products = preview.products;
  if (req.query.indexes) {
    const indexes = String(req.query.indexes).split(",").map(Number);
    products = indexes.map((i) => preview.products[i]).filter(Boolean);
  }

  if (products.length === 0) {
    return res.status(400).json({ error: "No products to export — check the indexes query param." });
  }

  const rows = buildCsvRows(products);
  const csv = toCsvString(rows);
  const fileName = `${preview.brand || "products"}-shopify-import.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(csv);
});

export default router;
