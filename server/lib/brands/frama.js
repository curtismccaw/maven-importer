const { findMatchingImages } = require("../imageMatch");

// FRAMA's sheet lists one row per SKU (with its own Bundle flag) and, where
// relevant, Component SKU / Component Qty columns pointing at the SKUs that
// make up a bundle. Per the confirmed approach: Single SKUs use their own
// "RRP GBP (converted)"; Bundle / Gift Box Bundle SKUs sum each component's
// own RRP GBP (converted) x its Component Qty. If a component's price can't
// be found, the bundle is flagged incomplete rather than guessed at.
function buildFramaProducts(rows, zipImages) {
  const priceBySku = {};
  rows.forEach((r) => {
    const sku = String(r["SKU"] || "").trim();
    const price = parseFloat(r["RRP GBP (converted)"]);
    if (sku && !Number.isNaN(price) && !(sku in priceBySku)) priceBySku[sku] = price;
  });

  const bySku = {};
  const duplicateSkus = new Set();
  rows.forEach((row) => {
    const sku = String(row["SKU"] || "").trim();
    if (!sku) return;
    if (!bySku[sku]) bySku[sku] = [];
    else duplicateSkus.add(sku);
    bySku[sku].push(row);
  });

  const products = [];
  Object.entries(bySku).forEach(([sku, skuRows]) => {
    const row = skuRows[0]; // representative row for product-level fields
    const bundleType = String(row["Bundle"] || "Single").trim();
    const flags = [];

    let price = null;
    if (bundleType === "Single") {
      price = priceBySku[sku];
      if (price === undefined) flags.push("No RRP GBP (converted) value found for this SKU.");
    } else {
      // Bundle / Gift Box Bundle: sum component prices x qty across every
      // component row recorded for this SKU.
      let sum = 0;
      let anyMissing = false;
      skuRows.forEach((r) => {
        const compSku = String(r["Component SKU"] || "").trim();
        const qty = parseFloat(r["Component Qty"]) || 1;
        if (!compSku) return;
        const compPrice = priceBySku[compSku];
        if (compPrice === undefined) {
          anyMissing = true;
          flags.push(`Missing price for component SKU ${compSku}.`);
        } else {
          sum += compPrice * qty;
        }
      });
      if (anyMissing || sum === 0) {
        flags.push("Bundle pricing incomplete, needs a manual price check before import.");
        price = priceBySku[sku]; // fall back to the SKU's own price if it has one, else stays null
      } else {
        price = sum;
      }
    }

    if (duplicateSkus.has(sku)) {
      flags.push("Duplicate SKU appears on multiple rows with potentially different data, verify which row is current.");
    }

    const title = String(row["Product Name"] || "").trim();
    if (!title) return;

    const candidates = [sku].filter(Boolean);
    const { images, matchType, matchedOn } = findMatchingImages(candidates, zipImages);

    products.push({
      title,
      body_html: String(row["Detailed Product Description"] || ""),
      vendor: "FRAMA",
      product_type: String(row["Product Family"] || ""),
      tags: "",
      variants: [
        {
          sku,
          price: price !== null && price !== undefined ? String(price) : "",
          compare_at_price: "",
          inventory_qty: "0",
          option1_name: "",
          option1_value: "",
          option2_name: "",
          option2_value: "",
          image_url: "",
          image_match_key: sku,
          local_images: images,
          image_match_type: matchType,
          image_matched_on: matchedOn,
          weight_grams: "",
        },
      ],
      flags,
    });
  });

  return products;
}

module.exports = { buildFramaProducts };
