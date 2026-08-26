// &Tradition: rows sharing the same Title correctly group into one product
// with variants (confirmed against the Alima Shelving example, two finishes
// under one title). Straight title-based grouping, unlike Muuto below.
export function groupATradition(mappedRows) {
  const grouped = new Map();
  for (const r of mappedRows) {
    if (!r.title) continue;
    if (!grouped.has(r.title)) {
      grouped.set(r.title, {
        title: r.title,
        body_html: r.body_html,
        vendor: r.vendor || "&Tradition",
        product_type: r.product_type,
        tags: r.tags,
        variants: [],
      });
    }
    grouped.get(r.title).variants.push({
      sku: r.sku,
      price: r.price,
      compare_at_price: r.compare_at_price,
      option1_name: r.option1_name || "Finish",
      option1_value: r.option1_value,
      option2_name: "",
      option2_value: "",
      image_url: r.image_url,
    });
  }
  return [...grouped.values()];
}
