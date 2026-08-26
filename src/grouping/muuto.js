// Muuto: do NOT group by the PRODUCT column directly. Muuto bakes the
// colourway into that name (e.g. "...Black" vs "...Grey"), so grouping on it
// produces near-duplicate one-colour products instead of proper variants.
// Group on FAMILY + TYPE + MODEL instead, per brand-mapping-notes.md, which
// produced 447 real products (350 multi-variant) out of 1,875 rows.
export function groupMuuto(mappedRows) {
  const grouped = new Map();
  for (const r of mappedRows) {
    const raw = r._raw || {};
    const key = [raw["FAMILY"], raw["TYPE"], raw["MODEL"]].join("||");
    if (!key.trim()) continue;

    if (!grouped.has(key)) {
      grouped.set(key, {
        title: r.title, // first row's title stands in for the group title
        body_html: r.body_html,
        vendor: r.vendor || "Muuto",
        product_type: r.product_type,
        tags: r.tags,
        variants: [],
      });
    }
    grouped.get(key).variants.push({
      sku: r.sku,
      price: r.price,
      compare_at_price: r.compare_at_price,
      option1_name: r.option1_name || "Colour",
      option1_value: r.option1_value,
      option2_name: "",
      option2_value: "",
      image_url: r.image_url,
    });
  }
  return [...grouped.values()];
}
