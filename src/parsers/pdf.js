import fs from "node:fs";
import pdfParse from "pdf-parse";

/**
 * Parse a New Works PDF price list into row-like objects.
 *
 * This is a starting point, not a finished parser: the sandbox testing
 * (191 pages, ~999 rows, one product pushed live) was done with
 * `pdftotext -layout` plus manual row-splitting logic that isn't fully
 * captured here yet. Two known open items from brand-mapping-notes.md /
 * memory apply directly to this function:
 *
 *   1. Currency column label anomaly: columns are labelled EUR but the file
 *      itself is titled as a GBP retail list. Needs querying with the brand
 *      before trusting either label blindly — don't assume which one is
 *      correct in code.
 *   2. Spare Parts section needs its own parsing branch; it doesn't follow
 *      the main product table's row shape and isn't handled here yet.
 *
 * Treat the row-extraction logic below as a placeholder to replace with the
 * proven layout-parsing approach once it's ported over from the shell-based
 * pdftotext workflow used during sandbox testing.
 */
export async function parsePdf(filePath, { brand } = {}) {
  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);

  // Placeholder extraction: split on lines, look for a simple
  // "SKU  Name  Price" shape. This will need to be replaced with the actual
  // column-position logic proven during sandbox testing before this is
  // used on a real New Works file.
  const lines = data.text.split("\n").map((l) => l.trim()).filter(Boolean);
  const rowPattern = /^([A-Z0-9-]{4,})\s+(.+?)\s+([\d.,]+)\s*(EUR|GBP)?$/i;

  const rows = [];
  for (const line of lines) {
    const m = line.match(rowPattern);
    if (m) {
      rows.push({
        SKU: m[1],
        "Product Name": m[2],
        Price: m[3],
        "Currency Label": m[4] || "",
      });
    }
  }

  return {
    headers: ["SKU", "Product Name", "Price", "Currency Label"],
    rows,
    pageCount: data.numpages,
    warning:
      rows.length === 0
        ? "No rows matched the placeholder pattern. This parser needs the real layout logic ported in before use — see the comment at the top of this file."
        : undefined,
  };
}

/**
 * TODO: Spare Parts section parser. Not started. The Spare Parts section of
 * New Works' PDF doesn't follow the main table's row shape (per
 * brand-mapping-notes.md), so it needs its own extraction pass once its
 * layout has been inspected the way the main table's was.
 */
export async function parseSpareParts() {
  throw new Error("Spare Parts parsing is not implemented yet.");
}
