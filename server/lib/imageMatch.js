function normalizeName(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/i, "") // strip file extension
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
}

// Strips a trailing "-1", "-2", "(2)" etc, so "sku-123-2.jpg" and "sku-123.jpg"
// are recognised as two photos of the same match key rather than two misses.
function baseKey(normalized) {
  return normalized.replace(/-?\(?\d+\)?$/, "").replace(/-+$/, "");
}

// zipImages: { normalizedKey: { mimeType, buffer } }
// candidates: ordered list of raw strings to try (mapped column value, SKU, colour, ...)
// Returns { images: [{ key, mimeType, buffer }], matchType, matchedOn }
function findMatchingImages(candidates, zipImages) {
  const zipKeys = Object.keys(zipImages);
  if (!zipKeys.length) return { images: [], matchType: "none", matchedOn: null };

  const cleanCandidates = candidates.map((c) => (c ? normalizeName(c) : "")).filter(Boolean);

  // Pass 1: exact match, or exact match once a trailing photo-number is stripped.
  for (const cand of cleanCandidates) {
    const hits = zipKeys.filter((k) => k === cand || baseKey(k) === cand);
    if (hits.length) {
      return {
        images: hits.sort().map((k) => ({ key: k, ...zipImages[k] })),
        matchType: cand === cleanCandidates[0] ? "exact" : "fallback",
        matchedOn: cand,
      };
    }
  }

  // Pass 2: fuzzy contains-match in either direction, only for reasonably specific keys,
  // to avoid a short colour code matching half the folder.
  for (const cand of cleanCandidates) {
    if (cand.length < 3) continue;
    const hits = zipKeys.filter((k) => k.includes(cand) || cand.includes(k));
    if (hits.length) {
      return {
        images: hits.sort().map((k) => ({ key: k, ...zipImages[k] })),
        matchType: "fuzzy",
        matchedOn: cand,
      };
    }
  }

  return { images: [], matchType: "none", matchedOn: null };
}

module.exports = { normalizeName, baseKey, findMatchingImages };
