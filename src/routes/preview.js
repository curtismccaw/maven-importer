import { Router } from "express";
import { applyMapping } from "../parsers/spreadsheet.js";
import { groupProducts } from "../grouping/index.js";
import { suggestMapping } from "../aiMapping.js";
import { get, set } from "../storage/store.js";

const router = Router();

// POST /api/preview  { uploadId, mapping? }
// If mapping is omitted, uses the brand's saved mapping.
router.post("/preview", (req, res) => {
  const { uploadId, mapping } = req.body;
  const upload = get("uploads", uploadId);
  if (!upload) return res.status(404).json({ error: "Unknown uploadId. Upload the file again." });

  const useMapping = mapping || get("mappings", upload.brand);
  if (!useMapping) {
    return res.status(400).json({ error: `No mapping provided and none saved for brand "${upload.brand}". POST a mapping first.` });
  }

  try {
    const mappedRows = applyMapping(upload.rows, useMapping);
    const products = groupProducts(upload.brand, mappedRows, {
      category: upload.category,
      rawRows: upload.rows,
      mapping: useMapping,
    });

    // Persist the built product list against this uploadId so /push can
    // reference it by index without re-sending the whole payload.
    set("previews", uploadId, { brand: upload.brand, products });

    res.json({
      uploadId,
      brand: upload.brand,
      productCount: products.length,
      variantCount: products.reduce((a, p) => a + p.variants.length, 0),
      flaggedIncomplete: products._flaggedIncomplete || [],
      products: products.map((p, idx) => ({
        idx,
        title: p.title,
        vendor: p.vendor,
        variantCount: p.variants.length,
        priceRange: [
          Math.min(...p.variants.map((v) => parseFloat(v.price) || 0)),
          Math.max(...p.variants.map((v) => parseFloat(v.price) || 0)),
        ],
        imagesMatched: p.variants.filter((v) => v.image_url).length,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mapping-suggest  { uploadId }
router.post("/mapping-suggest", async (req, res) => {
  const { uploadId } = req.body;
  const upload = get("uploads", uploadId);
  if (!upload) return res.status(404).json({ error: "Unknown uploadId." });

  try {
    const mapping = await suggestMapping(upload.headers, upload.rows);
    res.json({ uploadId, mapping });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
