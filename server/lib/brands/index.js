const { groupProducts: genericGroup } = require("./generic");
const { buildFramaProducts } = require("./frama");
const { buildMuutoProducts } = require("./muuto");
const { groupATradition } = require("./atradition");
const { groupHayLighting, groupHayFurniture } = require("./hay");
const { groupNewWorks } = require("./newWorks");
const { groupSimple } = require("./simple");

function normalizeBrand(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Converts raw CSV rows to mapped product format for grouping functions that expect it
function mapRowsToProducts(rows, mapping) {
  return rows.map(row => {
    const getValue = (key) => {
      const f = mapping[key];
      if (!f || f.mode === "none") return "";
      if (f.mode === "fixed") return f.value;
      if (f.mode === "column") return row[f.column] !== undefined ? row[f.column] : "";
      return "";
    };

    return {
      sku: row["SKU"] || "",
      title: getValue("title") || "",
      body_html: getValue("body_html") || "",
      vendor: getValue("vendor") || "",
      product_type: getValue("product_type") || "",
      tags: getValue("tags") || "",
      option1_name: getValue("option1_name") || "",
      option1_value: getValue("option1_value") || "",
      option2_name: getValue("option2_name") || "",
      option2_value: getValue("option2_value") || "",
      price: getValue("price") || "",
      compare_at_price: getValue("compare_at_price") || "",
      image_url: getValue("image_url") || "",
    };
  });
}

function buildProductsForBrand(brand, rows, mapping, zipImages) {
  const key = normalizeBrand(brand);

  // Brands with special implementations
  if (key === "frama") return buildFramaProducts(rows, zipImages);
  if (key === "muuto") return buildMuutoProducts(rows, zipImages);
  if (key === "atradition") return groupATradition(mapRowsToProducts(rows, mapping));
  if (key === "hay") return groupHayLighting(mapRowsToProducts(rows, mapping));
  if (key === "newworks") return groupNewWorks(rows, mapping).products;
  if (key === "moebe") return groupSimple(mapRowsToProducts(rows, mapping));

  // Default to generic grouper for everything else
  return genericGroup(rows, mapping, zipImages, brand);
}

module.exports = { buildProductsForBrand, normalizeBrand };
