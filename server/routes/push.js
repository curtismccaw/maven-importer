const express = require("express");
const { requireSession } = require("../lib/sessions");
const { createDraftProduct } = require("../lib/shopify");

const router = express.Router();

// Global (process-wide, not per-session) throttle between actual Shopify
// calls, protecting against the Admin API's rate limits when several people
// push at once or the frontend fires off a batch. Configurable via
// PUSH_INTERVAL_MS in .env; 0/unset disables it entirely.
let lastPushAt = 0;
async function waitForPushSlot() {
  const intervalMs = parseInt(process.env.PUSH_INTERVAL_MS || "0", 10) || 0;
  if (intervalMs <= 0) return;
  const elapsed = Date.now() - lastPushAt;
  if (elapsed < intervalMs) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs - elapsed));
  }
  lastPushAt = Date.now();
}

router.post("/push/:sessionId/:productIndex", async (req, res) => {
  try {
    const session = requireSession(req.params.sessionId);
    const idx = parseInt(req.params.productIndex, 10);
    const product = session.products[idx];
    if (!product) return res.status(404).json({ error: "No product at that index." });

    session.pushStatus[idx] = { status: "pushing", message: "" };
    try {
      await waitForPushSlot();
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
