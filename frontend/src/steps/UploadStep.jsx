import React, { useState } from "react";
import { uploadSpreadsheet, uploadZip, uploadPdf, listTemplateBrands, getTemplate } from "../api";

// The six brands built and tested so far. Any brand with a saved mapping
// template also gets merged in below, so onboarding a new brand and saving
// its template once is enough for it to show up here from then on.
const KNOWN_BRANDS = ["FRAMA", "&Tradition", "Moebe", "Muuto", "HAY", "New Works"];
const OTHER_VALUE = "__other__";

export default function UploadStep({ onUploaded, onPdfUploaded }) {
  const [brand, setBrand] = useState("");
  const [customBrand, setCustomBrand] = useState("");
  const [usingCustomBrand, setUsingCustomBrand] = useState(false);
  const [brandOptions, setBrandOptions] = useState(KNOWN_BRANDS);
  const [fileName, setFileName] = useState("");
  const [zipFileName, setZipFileName] = useState("");
  const [zipCount, setZipCount] = useState(null);
  const [pdfFileName, setPdfFileName] = useState("");
  const [pdfInfo, setPdfInfo] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    listTemplateBrands()
      .then((d) => {
        const merged = Array.from(new Set([...KNOWN_BRANDS, ...d.brands])).sort((a, b) => a.localeCompare(b));
        setBrandOptions(merged);
      })
      .catch(() => {});
  }, []);

  const handleBrandSelect = (value) => {
    if (value === OTHER_VALUE) {
      setUsingCustomBrand(true);
      setBrand(customBrand);
    } else {
      setUsingCustomBrand(false);
      setBrand(value);
    }
  };

  const effectiveBrand = usingCustomBrand ? customBrand : brand;

  const handleSpreadsheet = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const result = await uploadSpreadsheet(file, effectiveBrand);
      setFileName(file.name);
      setSessionId(result.sessionId);
      let mapping = null;
      if (effectiveBrand) {
        try {
          const tpl = await getTemplate(effectiveBrand);
          if (tpl) mapping = tpl.mapping;
        } catch (e) {}
      }
      onUploaded({ ...result, brand: effectiveBrand, savedMapping: mapping });
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
      <select value={usingCustomBrand ? OTHER_VALUE : brand} onChange={(e) => handleBrandSelect(e.target.value)}>
        <option value="">Select a brand...</option>
        {brandOptions.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
        <option value={OTHER_VALUE}>Other (custom brand)</option>
      </select>
      {usingCustomBrand && (
        <input
          value={customBrand}
          onChange={(e) => {
            setCustomBrand(e.target.value);
            setBrand(e.target.value);
          }}
          placeholder="Enter custom brand name"
          type="text"
        />
      )}
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
