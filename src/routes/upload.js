import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { readSpreadsheet } from "../parsers/spreadsheet.js";
import { parsePdf } from "../parsers/pdf.js";
import { set, get } from "../storage/store.js";

const upload = multer({ dest: "/tmp/maven-uploads/" });
const router = Router();

// POST /api/upload  (multipart form: file, brand, category?)
router.post("/upload", upload.single("file"), async (req, res) => {
  const { brand, category } = req.body;
  if (!brand) return res.status(400).json({ error: "brand is required" });
  if (!req.file) return res.status(400).json({ error: "file is required" });

  const ext = path.extname(req.file.originalname).toLowerCase();

  try {
    let result;
    if (ext === ".pdf") {
      result = await parsePdf(req.file.path, { brand });
    } else {
      result = readSpreadsheet(req.file.path);
    }

    // Stash the parsed rows server-side (keyed by an upload id) so the
    // preview/push routes don't need to re-upload the file each time.
    const uploadId = `${brand}-${Date.now()}`;
    set("uploads", uploadId, { brand, category: category || null, ...result, fileName: req.file.originalname });

    // Load any saved mapping for this brand so the client can pre-fill it.
    const savedMapping = get("mappings", brand) || null;

    res.json({
      uploadId,
      brand,
      category: category || null,
      headers: result.headers,
      rowCount: result.rows.length,
      savedMapping,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

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
