const { findMatchingImages } = require("../imageMatch");

// Escapes regex metacharacters in a string so it can be safely dropped into
// `new RegExp(...)`. Without this, a colour value containing characters like
// *, +, (, ), or . (e.g. "Midnight Blue ***", seen in the wild in Muuto's
// sheet) throws "Invalid regular expression" instead of just matching literally.
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Muuto bakes the colourway into the PRODUCT column (e.g. "...Black" vs
// "...Grey"), so grouping on it directly produces near-duplicate one-colour
// products instead of proper variants. Grouping on FAMILY + TYPE + MODEL
// instead correctly collapses colour variants under one product.
function buildMuutoProducts(rows, zipImages) {
  const grouped = {};

  rows.forEach((row) => {
    const family = String(row["FAMILY"] || "").trim();
    const type = String(row["TYPE"] || "").trim();
    const model = String(row["MODEL"] || "").trim();
    const groupKey = [family, type, model].filter(Boolean).join(" / ");
    if (!groupKey) return;

    const sku = String(row["ITEM NO."] || "").trim();
    const color = String(row["COLOR"] || "").trim();
    const imageUrl = String(row["PACKSHOT IMAGE"] || "").trim();

    const candidates = [sku, color].filter(Boolean);
    const { images, matchType, matchedOn } = findMatchingImages(candidates, zipImages);

    const variant = {
      sku,
      price: String(row["RETAIL PRICE"] || "").replace(/[^0-9.\-]/g, ""),
      compare_at_price: "",
      // Muuto's sheet is a wholesale price catalogue, not a stock feed, so
      // quantity defaults to 0 rather than implying real availability.
      inventory_qty: "0",
      option1_name: "Colour",
      option1_value: color,
      option2_name: "",
      option2_value: "",
      image_url: imageUrl,
      image_match_key: sku,
      local_images: images,
      image_match_type: images.length ? matchType : (imageUrl ? "url" : "none"),
      image_matched_on: matchedOn,
      weight_grams: "",
    };

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        title: String(row["PRODUCT"] || groupKey).replace(new RegExp(`\\s*${escapeRegExp(color)}\\s*$`, "i"), "").trim() || groupKey,
        body_html: String(row["PRODUCT DESCRIPTION"] || ""),
        vendor: "Muuto",
        product_type: String(row["CATEGORY"] || ""),
        tags: "",
        variants: [],
        flags: [],
      };
    }
    grouped[groupKey].variants.push(variant);
  });

  const products = Object.values(grouped);
  products.forEach((p) => {
    if (p.variants.length > 100) {
      p.flags.push(`${p.variants.length} variants exceeds Shopify's 100-variant cap, needs a grouping decision before import.`);
    }
  });
  return products;
}

module.exports = { buildMuutoProducts };
