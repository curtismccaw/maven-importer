// FRAMA and Moebe: colour/finish is already baked into the title, so each
// row is its own product with no grouping needed. This matches
// brand-mapping-notes.md for both brands.
export function groupSimple(mappedRows) {
  return mappedRows
    .filter((r) => r.title)
    .map((r) => ({
      title: r.title,
      body_html: r.body_html,
      vendor: r.vendor,
      product_type: r.product_type,
      tags: r.tags,
      variants: [
        {
          sku: r.sku,
          price: r.price,
          compare_at_price: r.compare_at_price,
          option1_name: "",
          option1_value: "",
          option2_name: "",
          option2_value: "",
          image_url: r.image_url,
        },
      ],
    }));
}
