const { findMatchingImages } = require("../imageMatch");

function cleanNumber(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[^0-9.\-]/g, "");
}

// mapping[key] = { mode: "none" | "fixed" | "column", column, value }
function makeGetValue(mapping) {
  return (row, key) => {
    const f = mapping[key];
    if (!f || f.mode === "none") return "";
    if (f.mode === "fixed") return f.value;
    if (f.mode === "column") return row[f.column] !== undefined ? row[f.column] : "";
    return "";
  };
}

// rows: array of plain objects keyed by spreadsheet header
// mapping: field -> {mode,column,value} as configured in the mapping step
// zipImages: { normalizedKey: { mimeType, buffer } }
// brandFallback: vendor name to use if no vendor column/value mapped
function groupProducts(rows, mapping, zipImages, brandFallback) {
  const getValue = makeGetValue(mapping);
  const grouped = {};

  rows.forEach((row) => {
    const title = String(getValue(row, "title") || "").trim();
    if (!title) return;

    const sku = String(getValue(row, "sku") || "");
    const option1Value = String(getValue(row, "option1_value") || "");
    const option2Value = String(getValue(row, "option2_value") || "");
    const matchKeyRaw = String(getValue(row, "image_filename") || "").trim();

    const candidates = [matchKeyRaw, sku, option2Value, option1Value].filter(Boolean);
    const { images, matchType, matchedOn } = findMatchingImages(candidates, zipImages);

    const variant = {
      sku,
      price: cleanNumber(getValue(row, "price")),
      compare_at_price: cleanNumber(getValue(row, "compare_at_price")),
      inventory_qty: cleanNumber(getValue(row, "inventory_qty")) || "0",
      option1_name: String(getValue(row, "option1_name") || ""),
      option1_value: option1Value,
      option2_name: String(getValue(row, "option2_name") || ""),
      option2_value: option2Value,
      image_url: String(getValue(row, "image_url") || ""),
      image_match_key: matchKeyRaw,
      local_images: images,
      image_match_type: matchType,
      image_matched_on: matchedOn,
      weight_grams: cleanNumber(getValue(row, "weight_grams")),
    };

    if (!grouped[title]) {
      grouped[title] = {
        title,
        body_html: String(getValue(row, "body_html") || ""),
        vendor: String(getValue(row, "vendor") || brandFallback || ""),
        product_type: String(getValue(row, "product_type") || ""),
        tags: String(getValue(row, "tags") || ""),
        variants: [],
        flags: [],
      };
    }
    grouped[title].variants.push(variant);
  });

  const products = Object.values(grouped);
  // Shopify's hard cap. Anything over this needs a data-shape decision, not an
  // auto-split, so we flag rather than silently truncating variants.
  products.forEach((p) => {
    if (p.variants.length > 100) {
      p.flags.push(`${p.variants.length} variants exceeds Shopify's 100-variant cap, needs a grouping decision before import.`);
    }
  });
  return products;
}

module.exports = { groupProducts, cleanNumber, makeGetValue };
