const express = require("express");
const { requireSession } = require("../lib/sessions");
const { askClaude, parseJsonResponse } = require("../lib/anthropic");

const router = express.Router();

router.post("/enrich/:sessionId/:productIndex", async (req, res) => {
  try {
    const session = requireSession(req.params.sessionId);
    const idx = parseInt(req.params.productIndex, 10);
    const product = session.products[idx];
    if (!product) return res.status(404).json({ error: "No product at that index." });

    const variantSummary = product.variants
      .map((v, i) => `${i + 1}. SKU ${v.sku || "n/a"}${v.option1_value ? `, ${v.option1_name || "Option 1"}: ${v.option1_value}` : ""}${v.option2_value ? `, ${v.option2_name || "Option 2"}: ${v.option2_value}` : ""}`)
      .join("\n");

    const factSheetBlock = session.pdfText
      ? session.pdfText.slice(0, 20000)
      : "(No brand fact sheet uploaded. Do not invent any facts, only lightly polish tone/SEO using the product data already given.)";

    const prompt = `You are writing e-commerce content for a design retailer. You must ONLY use facts that are explicitly present in the brand fact sheet text below, plus the product data given. Never invent, infer, or carry over specifications, materials, certifications, dimensions, or claims (e.g. colour temperature, CRI, outdoor suitability) that are not explicitly stated in the fact sheet or product data. If the fact sheet doesn't cover this product, or doesn't have enough detail to safely write a section, leave that field null/empty and set "flagged": true with a short "flag_reason" explaining what's missing.

Product title: ${product.title}
Existing description (from brand spreadsheet, may be reused/lightly polished, not a source for new facts beyond what's here): ${product.body_html || "none"}
Vendor: ${product.vendor}
Product type: ${product.product_type}
Variants:
${variantSummary}

Brand fact sheet text (only source of truth for any new facts):
${factSheetBlock}

Respond with ONLY raw JSON, no markdown or code fences, in this exact shape:
{
  "seo_title": "string under 70 characters, or null",
  "seo_description": "string under 160 characters, or null",
  "enriched_body_html": "a tone-consistent HTML description, grounded only in the existing description and fact sheet, or null if nothing to add beyond the original",
  "alt_texts": ["one alt text string per variant, in the same order as the variants listed above"],
  "faq": [{"question": "string", "answer": "string"}],
  "flagged": true or false,
  "flag_reason": "string or null"
}`;

    let result;
    try {
      const text = await askClaude(prompt);
      result = parseJsonResponse(text);
    } catch (e) {
      result = { flagged: true, flag_reason: "Enrichment call failed or returned invalid JSON, review manually." };
    }

    session.enrichment[idx] = result;
    res.json({ enrichment: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
