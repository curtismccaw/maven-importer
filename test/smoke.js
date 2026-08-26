// Smoke test: exercises readSpreadsheet -> applyMapping -> groupProducts
// against real project files, with no Shopify network calls. Run with:
//   node test/smoke.js
import { readSpreadsheet, applyMapping } from "../src/parsers/spreadsheet.js";
import { groupProducts } from "../src/grouping/index.js";

function assert(cond, msg) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`OK: ${msg}`);
}

// --- Muuto ---
{
  const { headers, rows } = readSpreadsheet("./test-data/Muuto_Master_Data_cleaned.csv");
  assert(rows.length === 1875, `Muuto row count is 1875 (got ${rows.length})`);

  const mapping = {
    title: { mode: "column", column: "PRODUCT" },
    sku: { mode: "column", column: "ITEM NO." },
    price: { mode: "column", column: "RETAIL PRICE" },
    vendor: { mode: "fixed", value: "Muuto" },
    product_type: { mode: "column", column: "CATEGORY" },
    option1_name: { mode: "fixed", value: "Colour" },
    option1_value: { mode: "column", column: "COLOR" },
    image_url: { mode: "column", column: "PACKSHOT IMAGE" },
  };
  const mapped = applyMapping(rows, mapping);
  const products = groupProducts("Muuto", mapped);

  assert(products.length === 447, `Muuto groups to 447 products (got ${products.length})`);
  const multiVariant = products.filter((p) => p.variants.length > 1).length;
  assert(multiVariant === 350, `Muuto has 350 multi-variant products (got ${multiVariant})`);
}

// --- FRAMA ---
{
  const { headers, rows } = readSpreadsheet("./test-data/FRAMA_Master_Sheet_with_GBP.csv");
  const mapping = {
    title: { mode: "column", column: "Product Name" },
    body_html: { mode: "column", column: "Detailed Product Description" },
    vendor: { mode: "fixed", value: "FRAMA" },
    product_type: { mode: "column", column: "Product Family" },
    sku: { mode: "column", column: "SKU" },
    price: { mode: "column", column: "RRP GBP (converted)" },
  };
  const mapped = applyMapping(rows, mapping);
  const products = groupProducts("FRAMA", mapped, { rawRows: rows, mapping });

  console.log(`FRAMA: ${rows.length} rows -> ${products.length} products, ${products._flaggedIncomplete?.length || 0} flagged incomplete`);
  assert(products.length > 600 && products.length < 800, `FRAMA collapses to roughly 705 products via bundle-summing (got ${products.length})`);

  const flagged = products._flaggedIncomplete || [];
  const has11327 = flagged.some((f) => f.sku === "11327");
  assert(has11327, "SKU 11327's incomplete bundle is flagged, not silently mis-priced");

  const bundled = products.find((p) => p._bundleSummed);
  assert(bundled && Number(bundled.variants[0].price) > 0, "a bundled product has a non-zero summed price");
}

console.log("\nAll smoke tests passed.");
