const fs = require("fs");
const path = require("path");
const { askClaude, parseJsonResponse } = require("./anthropic");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE_PATH = path.join(DATA_DIR, "color-map.json");

// Deliberately a small, fixed palette. The point is simpler storefront
// filtering, not colour accuracy, so anything more granular than this
// defeats the purpose.
const CANONICAL_COLORS = [
  "Black", "White", "Grey", "Beige", "Brown", "Red", "Orange", "Yellow",
  "Green", "Blue", "Purple", "Pink", "Gold", "Silver", "Multicolor", "Clear",
];

function normalizeColorKey(raw) {
  return String(raw).trim().toLowerCase().replace(/\s+/g, " ");
}

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, "{}", "utf8");
}

function loadColorMap() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
  } catch (e) {
    return {};
  }
}

function saveColorMap(map) {
  ensureFile();
  fs.writeFileSync(FILE_PATH, JSON.stringify(map, null, 2), "utf8");
}

// Splits an array into chunks of a given size.
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function classifyBatch(rawColors) {
  const prompt = `You are simplifying detailed colour/finish names from furniture and homeware brand spreadsheets into a fixed set of basic colours, for Shopify storefront filtering.

For EACH raw value below, choose exactly one match from this fixed list: ${CANONICAL_COLORS.join(", ")}.

Rules:
- Wood/natural finishes (oak, walnut, ash, teak, birch, beech) count as Brown, unless the value explicitly names a paint/lacquer colour instead.
- Metallic finishes: brass/copper/bronze count as Gold; chrome/steel/aluminium/nickel count as Silver.
- If a value names two or more genuinely different colours (e.g. slash-separated dual finishes, a two-tone combination), use Multicolor.
- Ignore trailing decoration like "***", item codes, or "w. Clamp" / "w. Fixing Pin" style suffixes, they are not part of the colour, look at the colour word(s) only.
- Always pick the closest reasonable match rather than leaving anything unclassified.

Raw values (JSON array):
${JSON.stringify(rawColors)}

Respond with ONLY a raw JSON object mapping each raw value (exactly as given, as the key) to one canonical value from the list above. No markdown, no code fences, no extra commentary, no keys beyond the ones given.`;

  const text = await askClaude(prompt, { maxTokens: Math.min(4000, 200 + rawColors.length * 20) });
  const parsed = parseJsonResponse(text);

  // Guard against the model drifting off-list; fall back to Multicolor for
  // anything it didn't return cleanly rather than silently dropping it.
  const result = {};
  rawColors.forEach((raw) => {
    const val = parsed[raw];
    result[raw] = CANONICAL_COLORS.includes(val) ? val : "Multicolor";
  });
  return result;
}

// rawColors: array of raw colour strings (may include duplicates/blank).
// Returns { mapping: { rawColor -> canonicalColor }, newlyClassified, cached, total }
async function simplifyColors(rawColors) {
  const unique = Array.from(new Set(rawColors.map((c) => String(c || "").trim()).filter(Boolean)));
  const cache = loadColorMap();
  const mapping = {};
  const toClassify = [];

  unique.forEach((raw) => {
    const key = normalizeColorKey(raw);
    if (cache[key]) mapping[raw] = cache[key];
    else toClassify.push(raw);
  });

  const batches = chunk(toClassify, 150);
  for (const batch of batches) {
    const classified = await classifyBatch(batch);
    Object.entries(classified).forEach(([raw, canonical]) => {
      mapping[raw] = canonical;
      cache[normalizeColorKey(raw)] = canonical;
    });
  }
  if (toClassify.length) saveColorMap(cache);

  return {
    mapping,
    total: unique.length,
    newlyClassified: toClassify.length,
    cached: unique.length - toClassify.length,
  };
}

module.exports = { simplifyColors, normalizeColorKey, CANONICAL_COLORS };
