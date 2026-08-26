// Minimal file-backed key/value storage, replacing the artifact's
// window.storage calls. Good enough for a single-operator backend; swap for
// a real database if this ever needs concurrent multi-user access.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");

function filePath(namespace) {
  return path.join(DATA_DIR, `${namespace}.json`);
}

function readAll(namespace) {
  const fp = filePath(namespace);
  if (!fs.existsSync(fp)) return {};
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch {
    return {};
  }
}

function writeAll(namespace, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath(namespace), JSON.stringify(data, null, 2));
}

export function get(namespace, key) {
  return readAll(namespace)[key];
}

export function set(namespace, key, value) {
  const all = readAll(namespace);
  all[key] = value;
  writeAll(namespace, all);
}

export function list(namespace) {
  return Object.keys(readAll(namespace));
}
