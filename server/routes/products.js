const express = require("express");
const { requireSession } = require("../lib/sessions");
const { buildProductsForBrand } = require("../lib/brands");
const { toClientProduct } = require("../lib/clientShape");

const router = express.Router();

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
