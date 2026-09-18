const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const { createSession } = require("../lib/sessions");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded (expected field name 'file')." });
  try {
    // codepage 65001 = UTF-8. Without forcing this, SheetJS can mis-decode CSV
    // buffers (accented characters and symbols like ° turn into mojibake) even
    // when the source file is genuinely UTF-8.
    const wb = XLSX.read(req.file.buffer, { type: "buffer", codepage: 65001 });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (!rawRows.length) return res.status(400).json({ error: "That file has no rows." });

    const headers = rawRows[0].map((h) => String(h).trim());
    const dataRows = rawRows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ""));
    const objRows = dataRows.map((r) => {
      const o = {};
      headers.forEach((h, i) => (o[h] = r[i] !== undefined ? r[i] : ""));
      return o;
    });

    const session = createSession();
    session.fileName = req.file.originalname;
    session.headers = headers;
    session.rows = objRows;
    if (req.body.brand) session.brand = String(req.body.brand);

    res.json({
      sessionId: session.id,
      fileName: session.fileName,
      headers: session.headers,
      rowCount: session.rows.length,
      sampleRows: session.rows.slice(0, 3),
    });
  } catch (err) {
    res.status(400).json({ error: `Could not read that file: ${err.message}` });
  }
});

module.exports = router;
