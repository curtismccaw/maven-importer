import { Router } from "express";
import { applyMapping } from "../parsers/spreadsheet.js";
import { groupProducts } from "../grouping/index.js";
import { suggestMapping } from "../aiMapping.js";
import { applyZipImageMatches } from "../parsers/zip.js";
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

    // Fill in any still-blank image_url from the zip upload (if one was
    // provided for this uploadId), matched by SKU — see src/parsers/zip.js.
    // Requires PUBLIC_BASE_URL to be set to this app's real, reachable URL;
    // it can't be localhost, since Shopify has to be able to fetch it.
    const zipImageMap = get("zipImages", uploadId);
    if (zipImageMap && !process.env.PUBLIC_BASE_URL) {
      return res.status(400).json({
        error: "A zip of images was uploaded for this brand, but PUBLIC_BASE_URL is not set in .env. Set it to this app's public URL (e.g. https://your-app.onrender.com) so Shopify can fetch the images — see README.",
      });
    }
    applyZipImageMatches(products, zipImageMap, process.env.PUBLIC_BASE_URL, uploadId);

    // Persist the built product list against this uploadId so /push and
    // /export can reference it by index without re-sending the whole payload.
    set("previews", uploadId, { brand: upload.brand, products });

    res.json({
      uploadId,
      brand: upload.brand,
      productCount: products.length,
      variantCount: products.reduce((a, p) => a + p.variants.length, 0),
      flaggedIncomplete: products._flaggedIncomplete || [],
      zipImagesMatched: products._zipImagesMatched || 0,
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
