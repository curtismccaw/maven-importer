import XLSX from "xlsx";
import fs from "node:fs";

/**
 * Read a .xlsx or .csv file into an array of row objects keyed by header.
 * Mirrors the artifact's handleFile logic: first sheet, first row as headers,
 * blank rows dropped.
 */
export function readSpreadsheet(filePath) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!rawRows.length) return { headers: [], rows: [] };

  const headers = rawRows[0].map((h) => String(h).trim());
  const dataRows = rawRows
    .slice(1)
    .filter((r) => r.some((c) => String(c).trim() !== ""));

  const rows = dataRows.map((r) => {
    const o = {};
    headers.forEach((h, i) => (o[h] = r[i] !== undefined ? r[i] : ""));
    return o;
  });

  return { headers, rows };
}

function cleanNumber(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[^0-9.\-]/g, "");
}

/**
 * Apply a saved column mapping (see storage/mappings.js) to raw rows,
 * producing plain field values per row. Mirrors the artifact's getValue().
 */
export function applyMapping(rows, mapping) {
  const getValue = (row, key) => {
    const f = mapping[key];
    if (!f || f.mode === "none") return "";
    if (f.mode === "fixed") return f.value;
    if (f.mode === "column") return row[f.column] !== undefined ? row[f.column] : "";
    return "";
  };

  return rows.map((row) => ({
    title: String(getValue(row, "title") || "").trim(),
    body_html: String(getValue(row, "body_html") || ""),
    vendor: String(getValue(row, "vendor") || ""),
    product_type: String(getValue(row, "product_type") || ""),
    tags: String(getValue(row, "tags") || ""),
    sku: String(getValue(row, "sku") || ""),
    price: cleanNumber(getValue(row, "price")),
    compare_at_price: cleanNumber(getValue(row, "compare_at_price")),
    option1_name: String(getValue(row, "option1_name") || ""),
    option1_value: String(getValue(row, "option1_value") || ""),
    option2_name: String(getValue(row, "option2_name") || ""),
    option2_value: String(getValue(row, "option2_value") || ""),
    image_url: String(getValue(row, "image_url") || ""),
    _raw: row,
  }));
}
