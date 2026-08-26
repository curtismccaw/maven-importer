import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { readSpreadsheet } from "../parsers/spreadsheet.js";
import { parsePdf } from "../parsers/pdf.js";
import { extractZipImages } from "../parsers/zip.js";
import { set, get } from "../storage/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_ROOT = path.join(__dirname, "..", "..", "data", "images");

const upload = multer({ dest: "/tmp/maven-uploads/" });
const router = Router();

// POST /api/upload  (multipart form: file, brand, category?, imagesZip?)
// imagesZip is optional: brands with no usable image feed (&Tradition,
// Moebe, FRAMA — see brand-mapping-notes.md) supply photos this way,
// matched to each variant's SKU. See src/parsers/zip.js.
router.post(
  "/upload",
  upload.fields([{ name: "file", maxCount: 1 }, { name: "imagesZip", maxCount: 1 }]),
  async (req, res) => {
    const { brand, category } = req.body;
    const file = req.files?.file?.[0];
    const zipFile = req.files?.imagesZip?.[0];

    if (!brand) return res.status(400).json({ error: "brand is required" });
    if (!file) return res.status(400).json({ error: "file is required" });

    const ext = path.extname(file.originalname).toLowerCase();
    const uploadId = `${brand}-${Date.now()}`;

    try {
      let result;
      if (ext === ".pdf") {
        result = await parsePdf(file.path, { brand });
      } else {
        result = readSpreadsheet(file.path);
      }

      let zipImageCount = 0;
      if (zipFile) {
        const imagesDir = path.join(IMAGES_ROOT, uploadId);
        const zipImageMap = extractZipImages(zipFile.path, imagesDir);
        zipImageCount = Object.keys(zipImageMap).length;
        set("zipImages", uploadId, zipImageMap);
      }

      set("uploads", uploadId, { brand, category: category || null, ...result, fileName: file.originalname });

      const savedMapping = get("mappings", brand) || null;

      res.json({
        uploadId,
        brand,
        category: category || null,
        headers: result.headers,
        rowCount: result.rows.length,
        savedMapping,
        zipImageCount,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      fs.unlink(file.path, () => {});
      if (zipFile) fs.unlink(zipFile.path, () => {});
    }
  }
);

// POST /api/mappings  { brand, mapping }
router.post("/mappings", (req, res) => {
  const { brand, mapping } = req.body;
  if (!brand || !mapping) return res.status(400).json({ error: "brand and mapping are required" });
  set("mappings", brand, mapping);
  res.json({ ok: true });
});

// GET /api/mappings/:brand
router.get("/mappings/:brand", (req, res) => {
  const mapping = get("mappings", req.params.brand);
  res.json({ brand: req.params.brand, mapping: mapping || null });
});

export default router;
