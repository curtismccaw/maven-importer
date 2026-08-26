import { groupSimple } from "./simple.js";
import { groupFramaWithBundles } from "./frama.js";
import { groupATradition } from "./atradition.js";
import { groupMuuto } from "./muuto.js";
import { groupHayLighting, groupHayFurniture } from "./hay.js";

export const BRANDS = ["FRAMA", "&Tradition", "Moebe", "Muuto", "HAY", "New Works"];

/**
 * Maven prefixes every product title with the brand name on-site, e.g.
 * "Muuto - Airy Coffee Table - Half Size". Applied here, once, centrally,
 * rather than inside each per-brand grouping module, so it can't be missed
 * for a brand the next time one's added or a grouping module gets rewritten.
 *
 * Mutates titles in place (rather than mapping to a new array) so any
 * out-of-band properties attached to the products array itself — e.g.
 * FRAMA's `_flaggedIncomplete` — survive untouched.
 *
 * Idempotent: safe to call twice without doubling up the prefix, in case
 * a caller re-groups already-prefixed data (e.g. a retried push).
 */
function applyBrandPrefix(brand, products) {
  const prefix = `${brand} - `;
  for (const p of products) {
    if (p.title && !p.title.startsWith(prefix)) {
      p.title = prefix + p.title;
    }
  }
  return products;
}

/**
 * Route mapped rows through the correct brand-specific grouping strategy.
 * `category` distinguishes HAY's two file types since they behave
 * completely differently (see brand-mapping-notes.md).
 *
 * FRAMA is special-cased: its bundle-summing logic needs the raw rows and
 * the mapping together (see grouping/frama.js), not the pre-mapped rows
 * used by every other brand, because it needs the Bundle/Component SKU/
 * Component Qty columns that aren't part of the generic field mapping.
 */
export function groupProducts(brand, mappedRows, { category, rawRows, mapping } = {}) {
  let products;

  switch (brand) {
    case "FRAMA": {
      if (!rawRows || !mapping) {
        throw new Error("FRAMA grouping requires { rawRows, mapping } to be passed for bundle-price summing.");
      }
      const { products: framaProducts, flagged } = groupFramaWithBundles(rawRows, mapping);
      if (flagged.length) {
        // Surfaced via the thrown-carrying object rather than swallowed —
        // the caller (routes/preview.js) is expected to report these, not
        // silently drop them. See FRAMA SKU 11327 in brand-mapping-notes.md
        // for the known example of this happening.
        framaProducts._flaggedIncomplete = flagged;
      }
      products = framaProducts;
      break;
    }
    case "Moebe":
      products = groupSimple(mappedRows);
      break;
    case "&Tradition":
      products = groupATradition(mappedRows);
      break;
    case "Muuto":
      products = groupMuuto(mappedRows);
      break;
    case "HAY":
      if (category === "Lighting") products = groupHayLighting(mappedRows);
      else if (category === "Furniture") products = groupHayFurniture(mappedRows);
      else throw new Error(`HAY requires a category ("Lighting" or "Furniture") to select the correct grouping strategy.`);
      break;
    case "New Works":
      throw new Error(
        "New Works is PDF-based, not spreadsheet-based. Use parsers/pdf.js and its own grouping, not this module."
      );
    default:
      throw new Error(`Unknown brand: ${brand}`);
  }

  return applyBrandPrefix(brand, products);
}