// FRAMA: most rows are one-row-per-product (Bundle = "Single"), but ~756
// rows are physical bundle components sharing a SKU (Bundle = "Bundle" or
// "Gift Box Bundle"). Each component row's price column is the COMPONENT's
// own standalone price, not a bundle price — confirmed by cross-referencing
// component SKUs against their own standalone rows. The correct bundle
// price is Σ(component price × component qty) across every row sharing
// that SKU.
//
// This groups by raw SKU (not the generic title-based grouping), and
// operates on raw rows directly (not the field-mapped output) because it
// needs the Bundle / Component SKU / Component Qty columns, which aren't
// part of the generic FIELDS mapping.
export function groupFramaWithBundles(rawRows, mapping) {
  const getValue = (row, key) => {
    const f = mapping[key];
    if (!f || f.mode === "none") return "";
    if (f.mode === "fixed") return f.value;
    if (f.mode === "column") return row[f.column] !== undefined ? row[f.column] : "";
    return "";
  };

  const bySku = new Map();
  for (const row of rawRows) {
    const sku = String(row["SKU"] ?? "").trim();
    if (!sku) continue;
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push(row);
  }

  const products = [];
  const flagged = [];

  for (const [sku, componentRows] of bySku) {
    const first = componentRows[0];
    const bundleType = first["Bundle"];
    const title = String(getValue(first, "title") || first["Product Name"] || "").trim();
    if (!title) continue;

    let total = 0;
    let incomplete = false;
    const componentDetails = [];

    for (const row of componentRows) {
      const rawPrice = row["RRP GBP (converted)"];
      const qty = Number(row["Component Qty"]) || 1; // blank qty (Single rows) = 1
      const price = Number(rawPrice);
      componentDetails.push({
        componentSku: row["Component SKU"],
        componentName: row["Component Name"],
        qty,
        price: rawPrice === "" ? null : price,
      });
      if (rawPrice === "" || Number.isNaN(price)) {
        incomplete = true;
        continue;
      }
      total += price * qty;
    }

    const isBundle = bundleType === "Bundle" || bundleType === "Gift Box Bundle";

    if (incomplete) {
      flagged.push({ sku, title, bundleType, componentDetails, reason: "One or more components have no price; total would be incomplete." });
      continue; // don't silently ship a wrong price — surface it for review instead
    }

    products.push({
      title,
      body_html: String(getValue(first, "body_html") || ""),
      vendor: String(getValue(first, "vendor") || "FRAMA"),
      product_type: String(getValue(first, "product_type") || ""),
      tags: String(getValue(first, "tags") || ""),
      _sku: sku,
      _bundleSummed: isBundle, // mirrors the artifact's "Σ-flagged in preview" marker
      _componentCount: componentRows.length,
      variants: [
        {
          sku,
          price: String(total),
          compare_at_price: "",
          option1_name: "",
          option1_value: "",
          option2_name: "",
          option2_value: "",
          image_url: String(getValue(first, "image_url") || ""),
        },
      ],
    });
  }

  return { products, flagged };
}
