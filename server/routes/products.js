const express = require("express");
const { requireSession } = require("../lib/sessions");
const { buildProductsForBrand } = require("../lib/brands");
const { toClientProduct } = require("../lib/clientShape");
const { templatedAltText } = require("../lib/altText");

const router = express.Router();

// Alt text is templated (title + colour), not AI-generated, so it costs
// nothing and doesn't need the enrichment step run first, attach it as soon
// as products exist. It gets recomputed after colour simplification too
// (see routes/colors.js), since a cleaned-up colour makes for a better label.
function attachAltText(products) {
  products.forEach((p) => {
    p.variants.forEach((v) => {
      v.alt_text = templatedAltText(p, v);
    });
  });
}

router.post("/products/build/:sessionId", (req, res) => {
  try {
    const session = requireSession(req.params.sessionId);
    const { mapping, brand } = req.body;
    if (!mapping) return res.status(400).json({ error: "Missing mapping in request body." });

    session.mapping = mapping;
    if (brand) session.brand = brand;

    const products = buildProductsForBrand(session.brand, session.rows, mapping, session.zipImages);
    attachAltText(products);
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
