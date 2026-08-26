import { groupSimple } from "./simple.js";
import { groupFramaWithBundles } from "./frama.js";
import { groupATradition } from "./atradition.js";
import { groupMuuto } from "./muuto.js";
import { groupHayLighting, groupHayFurniture } from "./hay.js";

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
  switch (brand) {
    case "FRAMA": {
      if (!rawRows || !mapping) {
        throw new Error("FRAMA grouping requires { rawRows, mapping } to be passed for bundle-price summing.");
      }
      const { products, flagged } = groupFramaWithBundles(rawRows, mapping);
      if (flagged.length) {
        // Surfaced via the thrown-carrying object rather than swallowed —
        // the caller (routes/preview.js) is expected to report these, not
        // silently drop them. See FRAMA SKU 11327 in brand-mapping-notes.md
        // for the known example of this happening.
        products._flaggedIncomplete = flagged;
      }
      return products;
    }
    case "Moebe":
      return groupSimple(mappedRows);
    case "&Tradition":
      return groupATradition(mappedRows);
    case "Muuto":
      return groupMuuto(mappedRows);
    case "HAY":
      if (category === "Lighting") return groupHayLighting(mappedRows);
      if (category === "Furniture") return groupHayFurniture(mappedRows);
      throw new Error(
        `HAY requires a category ("Lighting" or "Furniture") to select the correct grouping strategy.`
      );
    case "New Works":
      throw new Error(
        "New Works is PDF-based, not spreadsheet-based. Use parsers/pdf.js and its own grouping, not this module."
      );
    default:
      throw new Error(`Unknown brand: ${brand}`);
  }
}

export const BRANDS = ["FRAMA", "&Tradition", "Moebe", "Muuto", "HAY", "New Works"];
