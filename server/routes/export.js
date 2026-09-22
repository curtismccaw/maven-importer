const express = require("express");
const XLSX = require("xlsx");
const { requireSession } = require("../lib/sessions");

const router = express.Router();

const SHOPIFY_CSV_HEADERS = ["Handle", "Title", "Body (HTML)", "Vendor", "Product Category", "Type", "Tags", "Published", "Option1 Name", "Option1 Value", "Option1 Linked To", "Option2 Name", "Option2 Value", "Option2 Linked To", "Option3 Name", "Option3 Value", "Option3 Linked To", "Variant SKU", "Variant Grams", "Variant Inventory Tracker", "Variant Inventory Qty", "Variant Inventory Policy", "Variant Fulfillment Service", "Variant Price", "Variant Compare At Price", "Variant Requires Shipping", "Variant Taxable", "Variant Barcode", "Image Src", "Image Position", "Image Alt Text", "Gift Card", "SEO Title", "SEO Description", "Color (product.metafields.shopify.color-pattern)", "Variant Image", "Status"];

function slugify(title) {
  return String(title).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function emptyRow() {
  const row = {};
  SHOPIFY_CSV_HEADERS.forEach((h) => (row[h] = ""));
  return row;
}

// Local (zip) images have no public URL of their own here since the CSV path
// is meant for review/manual re-upload rather than the API push, so we note
// that in the cell rather than dumping raw base64 into a spreadsheet cell.
function imageCellValue(variant) {
  if (variant.image_url) return variant.image_url;
  if (variant.local_images && variant.local_images.length) {
    return `[local file: ${variant.local_images[0].key}, export via Push instead for automatic upload]`;
  }
  return "";
}

router.get("/export/csv/:sessionId", (req, res) => {
  try {
    const session = requireSession(req.params.sessionId);
    const rows = [];

    session.products.forEach((p, pIdx) => {
      const handle = slugify(p.title);
      const usesOptions = p.variants.some((v) => v.option1_name) || p.variants.length > 1;
      const enr = session.enrichment[pIdx];
      const useEnrichedBody = enr && !enr.flagged && enr.enriched_body_html;

      p.variants.forEach((v, i) => {
        const row = emptyRow();
        row["Handle"] = handle;
        if (i === 0) {
          row["Title"] = p.title;
          row["Body (HTML)"] = useEnrichedBody ? enr.enriched_body_html : p.body_html;
          row["Vendor"] = p.vendor;
          row["Type"] = p.product_type;
          row["Tags"] = p.tags;
          row["Published"] = "FALSE";
          row["Status"] = "draft";
          if (enr && !enr.flagged) {
            row["SEO Title"] = enr.seo_title || "";
            row["SEO Description"] = enr.seo_description || "";
          }
          // Shopify's standard colour metafield is product-level (it can hold
          // more than one colour for the product as a whole), so it's set
          // once on the first row rather than repeated per variant.
          const uniqueColors = Array.from(new Set(p.variants.map((v) => v.simplified_color).filter(Boolean)));
          if (uniqueColors.length) row["Color (product.metafields.shopify.color-pattern)"] = uniqueColors.join(", ");
        }
        row["Option1 Name"] = usesOptions ? v.option1_name || "Title" : "";
        row["Option1 Value"] = usesOptions ? v.option1_value || "Default Title" : "";
        row["Option2 Name"] = v.option2_name || "";
        row["Option2 Value"] = v.option2_value || "";
        row["Variant SKU"] = v.sku;
        row["Variant Grams"] = v.weight_grams || "";
        row["Variant Inventory Tracker"] = "shopify";
        row["Variant Inventory Qty"] = v.inventory_qty;
        row["Variant Inventory Policy"] = "deny";
        row["Variant Fulfillment Service"] = "manual";
        row["Variant Price"] = v.price;
        row["Variant Compare At Price"] = v.compare_at_price;
        row["Variant Requires Shipping"] = "TRUE";
        row["Variant Taxable"] = "TRUE";

        const cellImage = imageCellValue(v);
        if (cellImage) {
          row["Image Src"] = cellImage;
          row["Image Position"] = "1";
          row["Variant Image"] = cellImage;
          if (v.alt_text) row["Image Alt Text"] = v.alt_text;
        }
        rows.push(row);
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(rows, { header: SHOPIFY_CSV_HEADERS });
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const filename = `${session.brand || "products"}-shopify-import.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
