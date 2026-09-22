// Alt text for a product's variants is almost entirely mechanical: the
// product title plus whatever varies (colour, and a second option if
// present) is descriptive enough for accessibility/SEO purposes, and
// doesn't need creative writing. Generating it from data we already have,
// rather than asking the model for one string per variant, means the
// enrichment response no longer scales with variant count at all, one
// product with 2 variants and one with 24 cost the same number of tokens.
function variantColourLabel(variant) {
  // Prefer the simplified colour (post "Simplify colours with AI") since
  // it's the cleanest, most consistent label; fall back to whatever raw
  // option values the row actually had otherwise.
  return variant.simplified_color || variant.option1_value || variant.option2_value || "";
}

function templatedAltText(product, variant) {
  const parts = [product.title];
  const colour = variantColourLabel(variant);
  if (colour) parts.push(colour);
  return parts.join(" – ");
}

function templatedAltTexts(product) {
  return product.variants.map((v) => templatedAltText(product, v));
}

module.exports = { templatedAltText, templatedAltTexts, variantColourLabel };
