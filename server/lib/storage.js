// Persists brand -> column-mapping templates to a JSON file on disk, so they
// survive a server restart (unlike the in-memory sessions). Deliberately a
// flat file rather than a database: there are ~20 brands, mapping objects are
// small, and this keeps the deployable footprint to "a folder + node".

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE_PATH = path.join(DATA_DIR, "templates.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, "{}", "utf8");
}

function readAll() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
  } catch (e) {
    return {};
  }
}

function writeAll(obj) {
  ensureFile();
  fs.writeFileSync(FILE_PATH, JSON.stringify(obj, null, 2), "utf8");
}

function listBrands() {
  return Object.keys(readAll());
}

function getTemplate(brand) {
  const all = readAll();
  return all[brand] || null;
}

function saveTemplate(brand, mapping) {
  const all = readAll();
  all[brand] = mapping;
  writeAll(all);
}

module.exports = { listBrands, getTemplate, saveTemplate };
