const express = require("express");
const { requireSession } = require("../lib/sessions");
const { createDraftProduct } = require("../lib/shopify");

const router = express.Router();

router.post("/push/:sessionId/:productIndex", async (req, res) => {
  try {
    const session = requireSession(req.params.sessionId);
    const idx = parseInt(req.params.productIndex, 10);
    const product = session.products[idx];
    if (!product) return res.status(404).json({ error: "No product at that index." });

    session.pushStatus[idx] = { status: "pushing", message: "" };
    try {
      const result = await createDraftProduct(product);
      const message = result.warnings.length ? result.warnings.join(" ") : `Created ${result.handle}`;
      session.pushStatus[idx] = { status: "success", message, productId: result.productId };
      res.json(session.pushStatus[idx]);
    } catch (err) {
      session.pushStatus[idx] = { status: "failed", message: err.message };
      res.status(200).json(session.pushStatus[idx]); // 200: the push attempt completed, it just failed
    }
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/push-status/:sessionId", (req, res) => {
  try {
    const session = requireSession(req.params.sessionId);
    res.json({ pushStatus: session.pushStatus });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
