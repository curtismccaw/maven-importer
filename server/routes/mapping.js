const express = require("express");
const { requireSession } = require("../lib/sessions");
const { askClaude, parseJsonResponse } = require("../lib/anthropic");
const storage = require("../lib/storage");

const router = express.Router();

const FIELD_KEYS = [
  "title", "body_html", "vendor", "product_type", "tags", "sku", "price",
  "compare_at_price", "inventory_qty", "option1_name", "option1_value",
  "option2_name", "option2_value", "image_url", "image_filename", "weight_grams",
];

router.post("/mapping/suggest/:sessionId", async (req, res) => {
  try {
    const session = requireSession(req.params.sessionId);
    const sample = session.rows.slice(0, 3);
    const prompt = `Spreadsheet headers: ${JSON.stringify(session.headers)}
Sample rows: ${JSON.stringify(sample)}

Map each of these Shopify import fields to the best-matching header from the list above, or null if nothing fits: ${FIELD_KEYS.join(", ")}.
For "image_filename", prefer a column that could serve as a stable per-row match key against filenames in a photo folder: a SKU/item-number column, or a colour/finish column, whichever seems most likely to correspond to how images are usually named for this kind of sheet.
Respond with ONLY a raw JSON object like {"title": "Product Name", "price": "RRP", "sku": null, ...}. No markdown, no explanation, no code fences.`;

    const text = await askClaude(prompt);
    const parsed = parseJsonResponse(text);

    const mapping = {};
    FIELD_KEYS.forEach((key) => {
      const col = parsed[key];
      mapping[key] = col && session.headers.includes(col) ? { mode: "column", column: col, value: "" } : { mode: "none", column: "", value: "" };
    });
    res.json({ mapping });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/templates", (req, res) => {
  res.json({ brands: storage.listBrands() });
});

router.get("/templates/:brand", (req, res) => {
  const mapping = storage.getTemplate(req.params.brand);
  if (!mapping) return res.status(404).json({ error: "No saved mapping for this brand yet." });
  res.json({ mapping });
});

router.post("/templates/:brand", (req, res) => {
  const { mapping } = req.body;
  if (!mapping) return res.status(400).json({ error: "Missing mapping in request body." });
  storage.saveTemplate(req.params.brand, mapping);
  res.json({ saved: true });
});

module.exports = router;
