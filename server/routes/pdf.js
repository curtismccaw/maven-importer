const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const { requireSession } = require("../lib/sessions");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post("/pdf/:sessionId", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded (expected field name 'file')." });
  try {
    const session = requireSession(req.params.sessionId);
    const parsed = await pdfParse(req.file.buffer);
    const text = (parsed.text || "").trim();

    session.pdfText = text;
    session.pdfFileName = req.file.originalname;

    res.json({
      fileName: req.file.originalname,
      textLength: text.length,
      warning: text ? null : "No extractable text found. This PDF may be scanned images rather than real text.",
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: `Could not read that PDF: ${err.message}` });
  }
});

module.exports = router;
