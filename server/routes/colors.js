const express = require("express");
const { requireSession } = require("../lib/sessions");
const { simplifyColors } = require("../lib/colorSimplify");
const { toClientProduct } = require("../lib/clientShape");
const { templatedAltText } = require("../lib/altText");

const router = express.Router();

const COLOR_NAME_PATTERN = /colou?r|finish|shade/i;

// Returns the raw colour-ish value for a variant, checking whichever option
// slot (1 or 2) is actually named like a colour/finish column, since that
// varies brand to brand (Muuto and FRAMA hardcode "Colour" as option 1, but a
// generically-mapped brand might put it in option 2, or name it "Finish").
function colorValueForVariant(v) {
  if (v.option1_name && COLOR_NAME_PATTERN.test(v.option1_name)) return v.option1_value;
  if (v.option2_name && COLOR_NAME_PATTERN.test(v.option2_name)) return v.option2_value;
  return null;
}

router.post("/colors/simplify/:sessionId", async (req, res) => {
  try {
    const session = requireSession(req.params.sessionId);
    if (!session.products.length) return res.status(400).json({ error: "No products built yet, run Preview first." });

    const rawColors = [];
    session.products.forEach((p) => {
      p.variants.forEach((v) => {
        const raw = colorValueForVariant(v);
        if (raw) rawColors.push(raw);
      });
    });

    if (!rawColors.length) {
      return res.json({ appliedTo: 0, total: 0, newlyClassified: 0, cached: 0, note: "No colour/finish option found on any variant." });
    }

    const { mapping, total, newlyClassified, cached } = await simplifyColors(rawColors);

    let appliedTo = 0;
    session.products.forEach((p) => {
      const colorTags = new Set();
      p.variants.forEach((v) => {
        const raw = colorValueForVariant(v);
        if (!raw) return;
        const canonical = mapping[raw];
        v.simplified_color = canonical || null;
        // Recompute now that a cleaner colour label is available, e.g.
        // "Product – Midnight Blue ***" becomes "Product – Blue".
        v.alt_text = templatedAltText(p, v);
        if (canonical) {
          colorTags.add(canonical);
          appliedTo += 1;
        }
      });
      if (colorTags.size) {
        const existing = new Set((p.tags || "").split(",").map((t) => t.trim()).filter(Boolean));
        // Every distinct colour present across this product's variants gets its
        // own tag, so a product with both a black and a white variant still
        // shows up under either filter.
        colorTags.forEach((c) => existing.add(`Colour: ${c}`));
        p.tags = Array.from(existing).join(", ");
      }
    });

    res.json({
      appliedTo,
      total,
      newlyClassified,
      cached,
      mapping,
      products: session.products.map(toClientProduct),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
