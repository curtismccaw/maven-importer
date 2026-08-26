// HAY Lighting: clean, title-based grouping with two options (Size/Finish,
// Colour). 99 products, largest 19 variants, well under Shopify's 100-variant
// cap. Matches brand-mapping-notes.md.
export function groupHayLighting(mappedRows) {
  const grouped = new Map();
  const seenComboPerTitle = new Map(); // dedupe the 3 known duplicate pairs

  for (const r of mappedRows) {
    if (!r.title) continue;
    if (!grouped.has(r.title)) {
      grouped.set(r.title, {
        title: r.title,
        body_html: r.body_html,
        vendor: r.vendor || "HAY",
        product_type: r.product_type,
        tags: r.tags,
        variants: [],
      });
      seenComboPerTitle.set(r.title, new Set());
    }
    const comboKey = `${r.option1_value}||${r.option2_value}`;
    const seen = seenComboPerTitle.get(r.title);
    if (seen.has(comboKey)) {
      // Exact duplicate combo under the same title (same as the 3 pairs
      // documented in brand-mapping-notes.md) — keep the first SKU seen.
      continue;
    }
    seen.add(comboKey);

    grouped.get(r.title).variants.push({
      sku: r.sku,
      price: r.price,
      compare_at_price: r.compare_at_price,
      option1_name: r.option1_name || "Size / Finish",
      option1_value: r.option1_value,
      option2_name: r.option2_value ? (r.option2_name || "Colour") : "",
      option2_value: r.option2_value,
      image_url: r.image_url,
    });
  }
  return [...grouped.values()];
}

/**
 * HAY Furniture is NOT implemented. This is intentional: it's a data-shape
 * problem, not a mapping problem (see brand-mapping-notes.md). 226 of 1,370
 * title-groupings exceed Shopify's 100-variant cap, a third configurator
 * axis is silently dropped causing SKU collisions in 61 groups, and 20 rows
 * have no GBP price. Someone who knows HAY's catalogue needs to decide
 * between: (a) a curated fabric/shell subset, (b) a coarser grouping axis,
 * or (c) a metafield-driven swatch selector, before this function can be
 * written. Wire the chosen strategy in here once that decision is made.
 */
export function groupHayFurniture() {
  throw new Error(
    "HAY Furniture grouping is not implemented pending a data-shape decision. " +
    "See brand-mapping-notes.md > HAY > HAY Furniture for the three blocking issues."
  );
}
