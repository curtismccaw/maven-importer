import AdmZip from "adm-zip";
import fs from "node:fs";
import path from "node:path";

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/** Same normalization the artifact used: strip extension, lowercase, trim —
 * so "12345.jpg", "12345.PNG", and "12345" all match the same SKU. */
export function normalizeName(name) {
  return String(name).trim().toLowerCase().replace(/\.[a-z0-9]+$/i, "");
}

/**
 * Extract every image from a zip into imagesDir, keyed by normalized
 * filename (without extension). Flat structure — nested folders inside the
 * zip are fine, only the basename is used for matching, matching the
 * artifact's original behaviour.
 *
 * Returns a map: { normalizedName: relativeFilePath }
 */
export function extractZipImages(zipPath, imagesDir) {
  fs.mkdirSync(imagesDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter((e) => !e.isDirectory && IMAGE_EXT.test(e.entryName));

  const map = {};
  for (const entry of entries) {
    const baseName = path.basename(entry.entryName);
    const key = normalizeName(baseName);
    // Keep the original extension so the served file has a correct content type.
    const safeFileName = `${key}${path.extname(baseName).toLowerCase()}`;
    const destPath = path.join(imagesDir, safeFileName);
    fs.writeFileSync(destPath, entry.getData());
    map[key] = safeFileName;
  }
  return map;
}

/**
 * Fill in image_url on any variant that doesn't already have one, by
 * matching its SKU (normalized) against the zip's extracted images. Mutates
 * and returns the products array. Only overrides blank image_url values —
 * a mapped Image URL column always wins if one was provided.
 */
export function applyZipImageMatches(products, zipImageMap, publicBaseUrl, uploadId) {
  if (!zipImageMap || Object.keys(zipImageMap).length === 0) return products;

  let matched = 0;
  for (const product of products) {
    for (const variant of product.variants) {
      if (variant.image_url) continue; // mapped column already supplied one
      const key = normalizeName(variant.sku || "");
      const fileName = zipImageMap[key];
      if (fileName) {
        variant.image_url = `${publicBaseUrl}/local-images/${uploadId}/${fileName}`;
        matched++;
      }
    }
  }
  if (matched > 0) products._zipImagesMatched = matched;
  return products;
}
