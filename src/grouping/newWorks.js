// New Works: one row = one product, same shape as FRAMA/Moebe (no
// variant/family grouping needed). Two things need computing rather than a
// straight column-to-field mapping, so this is special-cased like FRAMA's
// bundle logic rather than run through the generic mapping engine:
//
//   1. GBP price isn't supplied by the brand — the sheet has DKK, NOK, SEK,
//      EUR, and USD RRP, but no GBP column. Converted here from EUR at a
//      fixed mid-market rate, same rate documented for FRAMA, PENDING
//      SIGN-OFF from whoever owns pricing before this goes live for real.
//   2. Market approval — only products approved for UK and/or EU (or with
//      no approval requirement at all, i.e. non-electrical furniture,
//      "Approved for" = "N/A") are included. A product approved only for
//      other markets (US/AU/CA/JP/CN) is excluded rather than imported
//      with a price a UK customer shouldn't be able to buy it at.
//
// See brand-mapping-notes.md > New Works for the dry-run this was
// validated against: 1,466 valid rows -> 1,209 kept after both filters,
// 255 excluded for market approval, 2 excluded for missing EUR price
// (within the approved set).

const EUR_TO_GBP_RATE = 0.855; // same rate used for FRAMA — pending pricing sign-off, do not treat as final

function isApprovedForUKorEU(approved) {
  const a = String(approved || "").trim();
  if (!a) return false;
  if (a === "N/A") return true; // no approval requirement, e.g. non-electrical furniture
  return a.split(",").map((s) => s.trim()).some((m) => m === "UK" || m === "EU");
}

// Categories sometimes arrives as a comma-joined breadcrumb, e.g.
// "Furniture,Furniture>Stool" (8 rows in the confirmed dry run). Taking the
// first segment gives the top-level category, consistent with how the
// other five brands' Product type mapping resolves to a single value.
function normalizeCategory(raw) {
  return String(raw || "").split(",")[0].trim();
}

/**
 * @param {object[]} rawRows - unmapped rows straight from the spreadsheet
 * @param {object} mapping - field mapping (title/body_html/vendor/product_type
 *   may be column or fixed mode; price and the approval filter are always
 *   computed here regardless of what's mapped, since neither exists as a
 *   plain column in the source file)
 */
export function groupNewWorks(rawRows, mapping) {
  const getValue = (row, key) => {
    const f = mapping[key];
    if (!f || f.mode === "none") return "";
    if (f.mode === "fixed") return f.value;
    if (f.mode === "column") return row[f.column] !== undefined ? row[f.column] : "";
    return "";
  };

  const products = [];
  const excludedNotApproved = [];
  const excludedNoPrice = [];

  for (const row of rawRows) {
    const sku = String(row["SKU"] || "").trim();
    if (!sku) continue; // drops the stray filter-export junk row with no SKU

    const title = String(getValue(row, "title") || row["Product Name"] || "").trim();
    if (!title) continue;

    const approved = row["Approved for"];
    if (!isApprovedForUKorEU(approved)) {
      excludedNotApproved.push({ sku, title, approved: String(approved || "") });
      continue;
    }

    const eur = row["EUR (RRP)"];
    if (eur === "" || eur === null || eur === undefined) {
      excludedNoPrice.push({ sku, title });
      continue;
    }
    const gbp = Math.ceil(Number(eur) * EUR_TO_GBP_RATE);

    products.push({
      title,
      body_html: String(getValue(row, "body_html") || row["Design Description - English"] || ""),
      vendor: String(getValue(row, "vendor") || "New Works"),
      product_type: String(getValue(row, "product_type") || normalizeCategory(row["Categories"])),
      tags: "",
      variants: [
        {
          sku,
          price: String(gbp),
          compare_at_price: "",
          option1_name: "",
          option1_value: "",
          option2_name: "",
          option2_value: "",
          image_url: String(row["Photo 1"] || ""),
        },
      ],
    });
  }

  return { products, excludedNotApproved, excludedNoPrice };
}
