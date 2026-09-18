import React, { useState } from "react";
import { suggestMapping, saveTemplate } from "../api";

const FIELDS = [
  { key: "title", label: "Title", required: true, allowFixed: false },
  { key: "body_html", label: "Description", required: false, allowFixed: false },
  { key: "vendor", label: "Vendor", required: false, allowFixed: true },
  { key: "product_type", label: "Product type", required: false, allowFixed: true },
  { key: "tags", label: "Tags", required: false, allowFixed: false },
  { key: "sku", label: "SKU", required: false, allowFixed: false },
  { key: "price", label: "Price", required: true, allowFixed: false },
  { key: "compare_at_price", label: "Compare-at price", required: false, allowFixed: false },
  { key: "inventory_qty", label: "Inventory qty", required: false, allowFixed: false },
  { key: "option1_name", label: "Option 1 name (e.g. Size)", required: false, allowFixed: true },
  { key: "option1_value", label: "Option 1 value", required: false, allowFixed: false },
  { key: "option2_name", label: "Option 2 name (e.g. Colour)", required: false, allowFixed: true },
  { key: "option2_value", label: "Option 2 value", required: false, allowFixed: false },
  { key: "image_url", label: "Image URL", required: false, allowFixed: false },
  { key: "image_filename", label: "Image match key (filename, SKU, or colour column)", required: false, allowFixed: false },
  { key: "weight_grams", label: "Weight (g)", required: false, allowFixed: false },
];

export function emptyMapping() {
  const m = {};
  FIELDS.forEach((f) => (m[f.key] = { mode: "none", column: "", value: "" }));
  return m;
}

export default function MappingStep({ sessionId, headers, brand, mapping, setMapping, onBack, onContinue }) {
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState("");
  const [templateNote, setTemplateNote] = useState("");

  const setFieldMode = (key, mode) => setMapping((m) => ({ ...m, [key]: { ...m[key], mode } }));
  const setFieldColumn = (key, column) => setMapping((m) => ({ ...m, [key]: { ...m[key], column, mode: "column" } }));
  const setFieldValue = (key, value) => setMapping((m) => ({ ...m, [key]: { ...m[key], value, mode: "fixed" } }));

  const runAiSuggest = async () => {
    setAiLoading(true);
    setError("");
    try {
      const result = await suggestMapping(sessionId);
      setMapping(result.mapping);
    } catch (err) {
      setError("Auto-map didn't come back cleanly. Map the fields manually below.");
    }
    setAiLoading(false);
  };

  const requiredMissing = FIELDS.filter((f) => f.required && mapping[f.key].mode === "none");

  return (
    <div className="card">
      <div className="actions" style={{ marginTop: 0, marginBottom: 16 }}>
        <p className="note" style={{ margin: 0 }}>{headers.length} columns found.</p>
        <button className="btn btn-dark spacer" onClick={runAiSuggest} disabled={aiLoading}>
          {aiLoading ? "Suggesting..." : "Suggest mapping with AI"}
        </button>
      </div>
      {templateNote && <p className="note info">{templateNote}</p>}
      {error && <p className="error">{error}</p>}

      {FIELDS.map((f) => (
        <div key={f.key} className="mapping-row">
          <label>
            {f.label}
            {f.required && <span className="required"> *</span>}
          </label>
          <select
            value={mapping[f.key].mode === "column" ? mapping[f.key].column : ""}
            onChange={(e) => (e.target.value ? setFieldColumn(f.key, e.target.value) : setFieldMode(f.key, "none"))}
          >
            <option value="">No column</option>
            {headers.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          {f.allowFixed ? (
            <input
              type="text"
              placeholder="or fixed value"
              value={mapping[f.key].mode === "fixed" ? mapping[f.key].value : ""}
              onChange={(e) => setFieldValue(f.key, e.target.value)}
            />
          ) : (
            <div />
          )}
        </div>
      ))}

      {requiredMissing.length > 0 && (
        <p className="error">Still need: {requiredMissing.map((f) => f.label).join(", ")}</p>
      )}

      <div className="actions">
        <button className="btn" onClick={onBack}>Back</button>
        <button
          className="btn btn-outline"
          disabled={!brand}
          onClick={async () => {
            try {
              await saveTemplate(brand, mapping);
              setTemplateNote(`Saved mapping for ${brand}. Next month's sheet from this brand will auto-load it.`);
            } catch (e) {
              setTemplateNote("Couldn't save the template, but you can still push products this time.");
            }
          }}
        >
          Save mapping for {brand || "this brand"}
        </button>
        <button className="btn btn-primary spacer" disabled={requiredMissing.length > 0} onClick={onContinue}>
          Preview products
        </button>
      </div>
    </div>
  );
}
