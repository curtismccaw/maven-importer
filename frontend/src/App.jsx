import React, { useState } from "react";

const BRANDS = ["FRAMA", "&Tradition", "Moebe", "Muuto", "HAY", "New Works"];

// Must match the field keys src/parsers/spreadsheet.js::applyMapping()
// actually understands on the backend. Keeping this list in sync with the
// backend is a manual step right now — see README "Known limitations".
const FIELDS = [
  { key: "title", label: "Title", required: true, allowFixed: false },
  { key: "body_html", label: "Description", required: false, allowFixed: false },
  { key: "vendor", label: "Vendor", required: false, allowFixed: true },
  { key: "product_type", label: "Product type", required: false, allowFixed: true },
  { key: "tags", label: "Tags", required: false, allowFixed: false },
  { key: "sku", label: "SKU", required: false, allowFixed: false },
  { key: "price", label: "Price", required: true, allowFixed: false },
  { key: "compare_at_price", label: "Compare-at price", required: false, allowFixed: false },
  { key: "option1_name", label: "Option 1 name (e.g. Colour)", required: false, allowFixed: true },
  { key: "option1_value", label: "Option 1 value", required: false, allowFixed: false },
  { key: "option2_name", label: "Option 2 name", required: false, allowFixed: true },
  { key: "option2_value", label: "Option 2 value", required: false, allowFixed: false },
  { key: "image_url", label: "Image URL", required: false, allowFixed: false },
];

const emptyMapping = () => {
  const m = {};
  FIELDS.forEach((f) => (m[f.key] = { mode: "none", column: "", value: "" }));
  return m;
};

// Same-origin in production (Express serves this build directly). In dev,
// Vite's proxy (see vite.config.js) forwards this to localhost:3000.
const api = (path, opts) =>
  fetch(`/api${path}`, opts).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  });

export default function App() {
  const [step, setStep] = useState(1);
  const [brand, setBrand] = useState("");
  const [hayCategory, setHayCategory] = useState("");
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [imagesZip, setImagesZip] = useState(null);
  const [imagesZipName, setImagesZipName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [uploadId, setUploadId] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rowCount, setRowCount] = useState(0);
  const [mapping, setMapping] = useState(emptyMapping());
  const [mappingNote, setMappingNote] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [products, setProducts] = useState([]);
  const [flaggedIncomplete, setFlaggedIncomplete] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [pushing, setPushing] = useState(false);
  const [pushResults, setPushResults] = useState({});

  const [zipImagesMatched, setZipImagesMatched] = useState(0);

  const needsCategory = brand === "HAY";
  const isPdfBrand = brand === "New Works";
  // Per brand-mapping-notes.md: these three have no usable image feed and
  // rely on a zip upload matched by SKU.
  const usesZipImages = ["&Tradition", "Moebe", "FRAMA"].includes(brand);

  const handleUpload = async () => {
    if (!brand || !file) return;
    if (needsCategory && !hayCategory) {
      setUploadError("HAY requires a category (Furniture or Lighting) before uploading.");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("brand", brand);
      if (needsCategory) form.append("category", hayCategory);
      if (imagesZip) form.append("imagesZip", imagesZip);

      const data = await api("/upload", { method: "POST", body: form });
      setUploadId(data.uploadId);
      setHeaders(data.headers);
      setRowCount(data.rowCount);

      if (data.zipImageCount) {
        setMappingNote((prev) => `${prev ? prev + " " : ""}${data.zipImageCount} images found in the zip — they'll be matched to variants by SKU in the preview step.`.trim());
      }

      if (data.savedMapping) {
        setMapping(data.savedMapping);
        setMappingNote(`Loaded the saved mapping for ${brand}. Check it still matches this file's columns before continuing.`);
      } else {
        setMapping(emptyMapping());
        setMappingNote(`No saved mapping yet for ${brand}. Map the columns below and save it for next time.`);
      }
      setStep(2);
    } catch (err) {
      setUploadError(err.message);
    }
    setUploading(false);
  };

  const setFieldColumn = (key, column) => {
    setMapping((m) => ({ ...m, [key]: { ...m[key], column, mode: column ? "column" : "none" } }));
  };
  const setFieldValue = (key, value) => {
    setMapping((m) => ({ ...m, [key]: { ...m[key], value, mode: "fixed" } }));
  };

  const aiSuggest = async () => {
    setAiLoading(true);
    setAiError("");
    try {
      const data = await api("/mapping-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });
      setMapping((m) => ({ ...m, ...data.mapping }));
    } catch (err) {
      setAiError(err.message);
    }
    setAiLoading(false);
  };

  const saveMapping = async () => {
    try {
      await api("/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, mapping }),
      });
      setMappingNote(`Saved mapping for ${brand}. Next upload for this brand will auto-load it.`);
    } catch (err) {
      setMappingNote(`Couldn't save the mapping: ${err.message}`);
    }
  };

  const goToPreview = async () => {
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const data = await api("/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, mapping }),
      });
      setProducts(data.products);
      setFlaggedIncomplete(data.flaggedIncomplete || []);
      setZipImagesMatched(data.zipImagesMatched || 0);
      setSelectedIds(new Set(data.products.map((p) => p.idx)));
      setPushResults({});
      setStep(3);
    } catch (err) {
      setPreviewError(err.message);
    }
    setPreviewLoading(false);
  };

  const toggleSelected = (idx) => {
    setSelectedIds((s) => {
      const next = new Set(s);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(products.map((p) => p.idx)));
  const selectNone = () => setSelectedIds(new Set());

  const runPush = async (indexes) => {
    setPushing(true);
    try {
      const data = await api("/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, selectedIndexes: indexes, status: "DRAFT" }),
      });
      setPushResults((prev) => {
        const next = { ...prev };
        data.results.forEach((r) => (next[r.idx] = r));
        return next;
      });
    } catch (err) {
      setPushResults((prev) => {
        const next = { ...prev };
        indexes.forEach((idx) => (next[idx] = { status: "failed", message: err.message }));
        return next;
      });
    }
    setPushing(false);
  };

  const pushSelected = () => runPush([...selectedIds]);
  const retryFailed = () => {
    const failedIdx = Object.entries(pushResults)
      .filter(([, r]) => r.status === "failed")
      .map(([idx]) => Number(idx));
    if (failedIdx.length) runPush(failedIdx);
  };

  const requiredMissing = FIELDS.filter((f) => f.required && mapping[f.key].mode === "none");
  const successCount = Object.values(pushResults).filter((r) => r.status === "success").length;
  const failedCount = Object.values(pushResults).filter((r) => r.status === "failed").length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8 border-b border-slate-200 pb-6">
          <p className="text-xs tracking-widest uppercase text-teal-700 font-semibold">Maven &middot; wearemaven.co.uk</p>
          <h1 className="text-2xl font-bold mt-1">Product Importer</h1>
          <p className="text-slate-500 mt-1 text-sm">Brand spreadsheet in, Shopify draft products out.</p>
        </div>

        <div className="flex gap-4 mb-8 text-sm">
          {[[1, "Upload"], [2, "Map columns"], [3, "Curate & preview"], [4, "Push"]].map(([n, label]) => (
            <div key={n} className={`flex items-center gap-2 ${step === n ? "text-teal-700 font-semibold" : "text-slate-400"}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border ${step === n ? "border-teal-700 bg-teal-50" : "border-slate-300"}`}>{n}</span>
              {label}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <label className="block text-sm font-medium mb-2">Brand</label>
            <select
              value={brand}
              onChange={(e) => { setBrand(e.target.value); setHayCategory(""); setUploadError(""); }}
              className="w-full border border-slate-300 rounded px-3 py-2 mb-4 bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="">Select a brand&hellip;</option>
              {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>

            {needsCategory && (
              <>
                <label className="block text-sm font-medium mb-2">HAY category</label>
                <select
                  value={hayCategory}
                  onChange={(e) => setHayCategory(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 mb-4 bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="">Select a category&hellip;</option>
                  <option value="Lighting">Lighting</option>
                  <option value="Furniture">Furniture (blocked — see note below)</option>
                </select>
                {hayCategory === "Furniture" && (
                  <p className="text-xs text-amber-600 mb-4">
                    HAY Furniture grouping isn't implemented yet — it needs a data-shape decision first (see brand-mapping-notes.md). Uploading will succeed but Step 3 will fail with an explanation.
                  </p>
                )}
              </>
            )}

            {isPdfBrand && (
              <p className="text-xs text-amber-600 mb-4">
                New Works' PDF parser is a placeholder in this build, not the layout logic proven during sandbox testing. Expect this to need real work before it produces usable rows.
              </p>
            )}

            <label className="block text-sm font-medium mb-2">Spreadsheet or PDF</label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.pdf"
              onChange={(e) => { setFile(e.target.files[0]); setFileName(e.target.files[0]?.name || ""); }}
              className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-teal-700 file:text-white hover:file:bg-teal-800"
            />
            {fileName && <p className="text-xs text-slate-500 mt-2">Selected: {fileName}</p>}
            {uploadError && <p className="text-xs text-red-600 mt-3">{uploadError}</p>}

            {usesZipImages && (
              <>
                <label className="block text-sm font-medium mb-2 mt-6">
                  Product images (.zip, matched by SKU) — {brand} has no usable image feed
                </label>
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => { setImagesZip(e.target.files[0]); setImagesZipName(e.target.files[0]?.name || ""); }}
                  className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-slate-700 file:text-white hover:file:bg-slate-800"
                />
                {imagesZipName && <p className="text-xs text-slate-500 mt-2">Selected: {imagesZipName}</p>}
                <p className="text-xs text-slate-400 mt-1">
                  Name each file after its SKU (e.g. "2124.jpg"). Files that don't match any SKU are ignored, not an error.
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Requires PUBLIC_BASE_URL set in the server's .env to this app's real public address — Shopify has to be able to fetch these images, so localhost won't work once you're actually pushing products.
                </p>
              </>
            )}

            <button
              onClick={handleUpload}
              disabled={!brand || !file || uploading}
              className="mt-6 text-sm px-4 py-2 rounded bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload & continue"}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-500">{rowCount} rows found, {headers.length} columns.</p>
              <button onClick={aiSuggest} disabled={aiLoading} className="text-sm bg-slate-900 text-white px-3 py-1.5 rounded hover:bg-slate-700 disabled:opacity-50">
                {aiLoading ? "Suggesting..." : "Suggest mapping with AI"}
              </button>
            </div>
            {mappingNote && <p className="text-xs text-slate-500 mb-4 bg-teal-50 border border-teal-100 rounded px-3 py-2">{mappingNote}</p>}
            {aiError && <p className="text-xs text-red-600 mb-4">{aiError}</p>}

            <div className="space-y-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="grid grid-cols-12 gap-2 items-center">
                  <label className="col-span-3 text-sm">{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
                  <select
                    value={mapping[f.key].mode === "column" ? mapping[f.key].column : ""}
                    onChange={(e) => setFieldColumn(f.key, e.target.value)}
                    className="col-span-5 border border-slate-300 rounded px-2 py-1.5 text-sm"
                  >
                    <option value="">No column</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  {f.allowFixed ? (
                    <input
                      placeholder="or fixed value"
                      value={mapping[f.key].mode === "fixed" ? mapping[f.key].value : ""}
                      onChange={(e) => setFieldValue(f.key, e.target.value)}
                      className="col-span-4 border border-slate-300 rounded px-2 py-1.5 text-sm"
                    />
                  ) : <div className="col-span-4" />}
                </div>
              ))}
            </div>

            {requiredMissing.length > 0 && (
              <p className="text-xs text-red-600 mt-4">Still need: {requiredMissing.map((f) => f.label).join(", ")}</p>
            )}
            {previewError && <p className="text-xs text-red-600 mt-4">{previewError}</p>}

            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(1)} className="text-sm px-4 py-2 rounded border border-slate-300 hover:bg-slate-50">Back</button>
              <button onClick={saveMapping} className="text-sm px-4 py-2 rounded border border-teal-700 text-teal-700 hover:bg-teal-50">Save mapping for {brand}</button>
              <button
                onClick={goToPreview}
                disabled={requiredMissing.length > 0 || previewLoading}
                className="ml-auto text-sm px-4 py-2 rounded bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {previewLoading ? "Grouping..." : "Preview products"}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            {flaggedIncomplete.length > 0 && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                <p className="text-xs text-amber-800 font-medium">{flaggedIncomplete.length} products excluded — incomplete pricing</p>
                <p className="text-xs text-amber-700 mt-1">
                  e.g. {flaggedIncomplete.slice(0, 3).map((f) => f.sku).join(", ")}{flaggedIncomplete.length > 3 ? "…" : ""} — a component's price is missing so the total can't be trusted. These aren't in the list below; review with the brand before pricing them manually.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <p className="text-sm text-slate-500">
                {products.length} products, {products.reduce((a, p) => a + p.variantCount, 0)} variants. Created as drafts, nothing goes live automatically.
                {zipImagesMatched > 0 && ` ${zipImagesMatched} variant images matched from the uploaded zip.`}
              </p>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-teal-700">{selectedIds.size} selected</span>
                <button onClick={selectAll} className="text-xs underline text-slate-500 hover:text-slate-700">Select all</button>
                <button onClick={selectNone} className="text-xs underline text-slate-500 hover:text-slate-700">Select none</button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-4">Tick the products Maven wants on the site. Only ticked products carry through to Step 4.</p>

            <div className="max-h-96 overflow-y-auto border border-slate-200 rounded">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={products.length > 0 && selectedIds.size === products.length}
                        ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < products.length; }}
                        onChange={(e) => (e.target.checked ? selectAll() : selectNone())}
                      />
                    </th>
                    <th className="text-left px-3 py-2">Title</th>
                    <th className="text-left px-3 py-2">Variants</th>
                    <th className="text-left px-3 py-2">Price range</th>
                    <th className="text-left px-3 py-2">Images</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const checked = selectedIds.has(p.idx);
                    const [min, max] = p.priceRange;
                    return (
                      <tr key={p.idx} onClick={() => toggleSelected(p.idx)} className={`border-t border-slate-100 cursor-pointer ${checked ? "" : "opacity-40"} hover:bg-slate-50`}>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={checked} onChange={() => toggleSelected(p.idx)} />
                        </td>
                        <td className="px-3 py-2">{p.title}</td>
                        <td className="px-3 py-2 text-slate-500">{p.variantCount}</td>
                        <td className="px-3 py-2 text-slate-500">{min === max ? `£${min}` : `£${min} - £${max}`}</td>
                        <td className={`px-3 py-2 ${p.imagesMatched < p.variantCount ? "text-amber-600" : "text-slate-500"}`}>{p.imagesMatched}/{p.variantCount} matched</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(2)} className="text-sm px-4 py-2 rounded border border-slate-300 hover:bg-slate-50">Back</button>
              <button onClick={() => setStep(4)} disabled={selectedIds.size === 0} className="ml-auto text-sm px-4 py-2 rounded bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50">
                Continue to push ({selectedIds.size})
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4 gap-3">
              <p className="text-sm text-slate-500">
                {Object.keys(pushResults).length === 0
                  ? `Ready to push ${selectedIds.size} products as drafts.`
                  : `${successCount} succeeded, ${failedCount} failed.`}
              </p>
              <div className="flex gap-2 shrink-0">
                <a
                  href={`/api/export/${uploadId}?indexes=${[...selectedIds].join(",")}`}
                  className="text-sm px-4 py-2 rounded border border-slate-300 hover:bg-slate-50 inline-block"
                >
                  Download CSV
                </a>
                {failedCount > 0 && (
                  <button onClick={retryFailed} disabled={pushing} className="text-sm px-4 py-2 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-50">
                    Retry {failedCount} failed
                  </button>
                )}
                <button onClick={pushSelected} disabled={pushing} className="text-sm px-4 py-2 rounded bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50">
                  {pushing ? "Pushing..." : `Push ${selectedIds.size} products`}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              CSV export is a Shopify bulk-import file for the {selectedIds.size} selected products — an alternative to pushing directly, e.g. for a manual review pass before import.
            </p>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded">
              {[...selectedIds].map((idx) => {
                const product = products.find((p) => p.idx === idx);
                const r = pushResults[idx];
                return (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{product?.title}</span>
                      {r?.message && <span className="text-xs text-slate-400 block">{r.message}</span>}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      !r ? "bg-slate-100 text-slate-500" :
                      r.status === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {r ? r.status : "waiting"}
                    </span>
                  </div>
                );
              })}
            </div>

            <button onClick={() => setStep(3)} className="text-sm px-4 py-2 mt-6 rounded border border-slate-300 hover:bg-slate-50">Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
