import React, { useState } from "react";
import { uploadSpreadsheet, uploadZip, uploadPdf, listTemplateBrands, getTemplate } from "../api";

export default function UploadStep({ onUploaded, onPdfUploaded }) {
  const [brand, setBrand] = useState("");
  const [savedBrands, setSavedBrands] = useState([]);
  const [fileName, setFileName] = useState("");
  const [zipFileName, setZipFileName] = useState("");
  const [zipCount, setZipCount] = useState(null);
  const [pdfFileName, setPdfFileName] = useState("");
  const [pdfInfo, setPdfInfo] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    listTemplateBrands().then((d) => setSavedBrands(d.brands)).catch(() => {});
  }, []);

  const handleSpreadsheet = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const result = await uploadSpreadsheet(file, brand);
      setFileName(file.name);
      setSessionId(result.sessionId);
      let mapping = null;
      if (brand) {
        try {
          const tpl = await getTemplate(brand);
          if (tpl) mapping = tpl.mapping;
        } catch (e) {}
      }
      onUploaded({ ...result, brand, savedMapping: mapping });
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const handleZip = async (e) => {
    const file = e.target.files[0];
    if (!file || !sessionId) return;
    setError("");
    setBusy(true);
    try {
      const result = await uploadZip(sessionId, file);
      setZipFileName(file.name);
      setZipCount(result.imageCount);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const handlePdf = async (e) => {
    const file = e.target.files[0];
    if (!file || !sessionId) return;
    setError("");
    setBusy(true);
    try {
      const result = await uploadPdf(sessionId, file);
      setPdfFileName(file.name);
      setPdfInfo(result.warning || `${result.textLength.toLocaleString()} characters of text extracted.`);
      if (onPdfUploaded) onPdfUploaded(result.textLength > 0);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="card">
      <label className="field-label">Brand</label>
      <input
        list="brand-list"
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        placeholder="e.g. FRAMA, Muuto, HAY"
        type="text"
      />
      <datalist id="brand-list">
        {savedBrands.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <p className="hint">Upload the spreadsheet after setting the brand so a saved mapping template (if any) auto-loads.</p>

      <label className="field-label">Spreadsheet (.csv or .xlsx)</label>
      <input type="file" accept=".csv,.xlsx,.xls" onChange={handleSpreadsheet} disabled={busy} />
      {fileName && <p className="hint">Loaded: {fileName}</p>}

      <label className="field-label">Product images (optional, .zip)</label>
      <input type="file" accept=".zip" onChange={handleZip} disabled={busy || !sessionId} />
      {zipFileName && <p className="hint">{zipFileName}: {zipCount} images found.</p>}
      <p className="hint">
        In the next step, map "Image match key" to whichever column names each file: filename, SKU, or a colour/finish column.
        If that column doesn't hit, the importer also tries SKU and colour on its own before giving up.
      </p>

      <label className="field-label">Brand fact sheet (optional, .pdf)</label>
      <input type="file" accept=".pdf" onChange={handlePdf} disabled={busy || !sessionId} />
      {pdfFileName && <p className="hint">{pdfFileName}: {pdfInfo}</p>}
      <p className="hint">
        Used only as the source of truth for AI content enrichment later (SEO copy, alt text, FAQs). Enrichment will not
        invent facts beyond what's in this document.
      </p>

      {!sessionId && <p className="hint" style={{ marginTop: 16 }}>Upload a spreadsheet first, image and PDF uploads attach to that session.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
