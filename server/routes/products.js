const express = require("express");
const { requireSession } = require("../lib/sessions");
const { buildProductsForBrand } = require("../lib/brands");

const router = express.Router();

// Strips the (non-serializable, potentially large) raw image buffers out of
// what we send to the browser; the frontend only needs to know an image was
// matched and how confidently, plus a small preview thumbnail.
function toClientProduct(p) {
  return {
    ...p,
    variants: p.variants.map((v) => ({
      ...v,
      local_images: (v.local_images || []).map((img) => ({
        key: img.key,
        mimeType: img.mimeType,
        // Sent as-is for preview. For very large photo libraries, add a
        // resize step here (e.g. with sharp) before base64-encoding, the
        // full-resolution buffer is what actually gets pushed to Shopify.
        previewDataUrl: `data:${img.mimeType};base64,${img.buffer.toString("base64")}`,
      })),
      imageCount: (v.local_images || []).length,
    })),
  };
}

router.post("/products/build/:sessionId", (req, res) => {
  try {
    const session = requireSession(req.params.sessionId);
    const { mapping, brand } = req.body;
    if (!mapping) return res.status(400).json({ error: "Missing mapping in request body." });

    session.mapping = mapping;
    if (brand) session.brand = brand;

    const products = buildProductsForBrand(session.brand, session.rows, mapping, session.zipImages);
    session.products = products; // keep full data (incl. buffers) server-side for push/export
    session.enrichment = {};
    session.pushStatus = {};

    res.json({
      products: products.map(toClientProduct),
      totalVariants: products.reduce((a, p) => a + p.variants.length, 0),
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

module.exports = router;
