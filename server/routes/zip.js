const express = require("express");
const multer = require("multer");
const AdmZip = require("adm-zip");
const { requireSession } = require("../lib/sessions");
const { normalizeName } = require("../lib/imageMatch");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024 } });

const MIME_BY_EXT = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

router.post("/zip/:sessionId", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded (expected field name 'file')." });
  try {
    const session = requireSession(req.params.sessionId);
    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries().filter((e) => !e.isDirectory && /\.(jpe?g|png|webp)$/i.test(e.entryName));

    const images = {};
    entries.forEach((entry) => {
      const ext = entry.entryName.split(".").pop().toLowerCase();
      const filename = entry.entryName.split("/").pop();
      const key = normalizeName(filename);
      images[key] = { mimeType: MIME_BY_EXT[ext] || "image/jpeg", buffer: entry.getData() };
    });

    session.zipImages = images;
    session.zipFileName = req.file.originalname;
    res.json({ imageCount: Object.keys(images).length, fileName: req.file.originalname });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

module.exports = router;
