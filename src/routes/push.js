import { Router } from "express";
import { createProduct, confirmImages } from "../shopifyClient.js";
import { get, set } from "../storage/store.js";

const router = Router();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function toShopifyVariant(v, optionNames) {
  const optionValues = [];
  if (optionNames[0]) optionValues.push({ optionName: optionNames[0], name: v.option1_value || "Default Title" });
  if (optionNames[1] && v.option2_value) optionValues.push({ optionName: optionNames[1], name: v.option2_value });
  return {
    price: String(v.price || "0"),
    sku: v.sku || undefined,
    optionValues,
  };
}

/**
 * POST /api/push
 * { uploadId, selectedIndexes: number[], status?: "DRAFT" | "ACTIVE" }
 *
 * Curation happens here: only the products at `selectedIndexes` (as returned
 * by /api/preview) are sent to Shopify. This is the server-side equivalent
 * of the artifact's Step 3 checkbox selection — see the earlier design
 * discussion on why curation needs to exist at all (Maven edits each
 * brand's range rather than listing everything).
 */
router.post("/push", async (req, res) => {
  const { uploadId, selectedIndexes, status } = req.body;
  const preview = get("previews", uploadId);
  if (!preview) return res.status(404).json({ error: "No preview found for this uploadId. Run /api/preview first." });
  if (!Array.isArray(selectedIndexes) || selectedIndexes.length === 0) {
    return res.status(400).json({ error: "selectedIndexes must be a non-empty array of product indexes from /api/preview." });
  }

  const intervalMs = Number(process.env.PUSH_INTERVAL_MS || 600);
  const results = [];

  for (const idx of selectedIndexes) {
    const product = preview.products[idx];
    if (!product) {
      results.push({ idx, status: "failed", message: "Index not found in preview." });
      continue;
    }

    const optionNames = [
      product.variants[0]?.option1_name,
      product.variants[0]?.option2_name,
    ].filter(Boolean);

    try {
      const created = await createProduct({
        product: {
          title: product.title,
          vendor: product.vendor,
          productType: product.product_type,
          status: status || "DRAFT",
          descriptionHtml: product.body_html,
          options: optionNames.length ? optionNames : ["Title"],
        },
        variants: product.variants.map((v) => toShopifyVariant(v, optionNames)),
        images: product.variants
          .filter((v) => v.image_url)
          .map((v) => ({ url: v.image_url, altText: `${product.title} - ${v.option1_value || ""}`.trim() })),
      });

      // Confirm images actually re-hosted rather than trusting the
      // immediate (often empty) response — documented Shopify behaviour.
      const hasImages = product.variants.some((v) => v.image_url);
      const imageCheck = hasImages ? await confirmImages(created.id) : { confirmed: true, product: null };

      results.push({
        idx,
        status: "success",
        productId: created.id,
        title: created.title,
        variantCount: created.variants.length,
        imagesConfirmed: imageCheck.confirmed,
      });
    } catch (err) {
      results.push({ idx, status: "failed", title: product.title, message: err.message });
    }

    await sleep(intervalMs);
  }

  set("pushResults", uploadId, results);

  res.json({
    uploadId,
    pushed: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  });
});

// GET /api/push/:uploadId  — retrieve the last push result without re-pushing
router.get("/push/:uploadId", (req, res) => {
  const results = get("pushResults", req.params.uploadId);
  if (!results) return res.status(404).json({ error: "No push results for this uploadId." });
  res.json({ uploadId: req.params.uploadId, results });
});

export default router;
