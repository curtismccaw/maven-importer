import Papa from "papaparse";

function slugify(title) {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Same header set the artifact used, so a CSV from this backend can be
// dropped straight into Shopify's bulk product importer the same way the
// artifact's export could.
const SHOPIFY_CSV_HEADERS = [
  "Handle", "Title", "Body (HTML)", "Vendor", "Product Category", "Type", "Tags", "Published",
  "Option1 Name", "Option1 Value", "Option1 Linked To", "Option2 Name", "Option2 Value", "Option2 Linked To",
  "Option3 Name", "Option3 Value", "Option3 Linked To", "Variant SKU", "Variant Grams",
  "Variant Inventory Tracker", "Variant Inventory Qty", "Variant Inventory Policy",
  "Variant Fulfillment Service", "Variant Price", "Variant Compare At Price", "Variant Requires Shipping",
  "Variant Taxable", "Variant Barcode", "Image Src", "Image Position", "Image Alt Text", "Gift Card",
  "SEO Title", "SEO Description", "Variant Image", "Status",
];

function emptyRow() {
  const row = {};
  SHOPIFY_CSV_HEADERS.forEach((h) => (row[h] = ""));
  return row;
}

/**
 * Build Shopify bulk-import CSV rows from full product objects (as stored
 * by routes/preview.js under the "previews" namespace — NOT the summary
 * shape returned to the client for the curation table).
 */
export function buildCsvRows(products) {
  const rows = [];
  products.forEach((p) => {
    const handle = slugify(p.title);
    const usesOptions = p.variants.length > 1 || p.variants.some((v) => v.option1_name);

    p.variants.forEach((v, i) => {
      const row = emptyRow();
      row["Handle"] = handle;
      if (i === 0) {
        row["Title"] = p.title;
        row["Body (HTML)"] = p.body_html || "";
        row["Vendor"] = p.vendor || "";
        row["Type"] = p.product_type || "";
        row["Tags"] = p.tags || "";
        row["Published"] = "FALSE";
        row["Status"] = "draft";
      }
      row["Option1 Name"] = usesOptions ? (v.option1_name || "Title") : "";
      row["Option1 Value"] = usesOptions ? (v.option1_value || "Default Title") : "";
      row["Option2 Name"] = v.option2_name || "";
      row["Option2 Value"] = v.option2_value || "";
      row["Variant SKU"] = v.sku || "";
      row["Variant Inventory Tracker"] = "shopify";
      row["Variant Inventory Qty"] = "0"; // no brand supplies a stock feed — confirmed manual monitoring
      row["Variant Inventory Policy"] = "deny";
      row["Variant Fulfillment Service"] = "manual";
      row["Variant Price"] = v.price || "0";
      row["Variant Compare At Price"] = v.compare_at_price || "";
      row["Variant Requires Shipping"] = "TRUE";
      row["Variant Taxable"] = "TRUE";
      if (v.image_url) {
        row["Image Src"] = v.image_url;
        row["Image Position"] = "1";
        row["Variant Image"] = v.image_url;
      }
      rows.push(row);
    });
  });
  return rows;
}

export function toCsvString(rows) {
  return Papa.unparse({ fields: SHOPIFY_CSV_HEADERS, data: rows });
}
