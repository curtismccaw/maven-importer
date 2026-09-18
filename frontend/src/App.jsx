import React, { useState } from "react";
import UploadStep from "./steps/UploadStep";
import MappingStep, { emptyMapping } from "./steps/MappingStep";
import PreviewStep from "./steps/PreviewStep";
import PushStep from "./steps/PushStep";
import { buildProducts } from "./api";

const STEP_LABELS = [
  [1, "Upload"],
  [2, "Map columns"],
  [3, "Preview & enrich"],
  [4, "Push"],
];

export default function App() {
  const [step, setStep] = useState(1);
  const [sessionId, setSessionId] = useState(null);
  const [brand, setBrand] = useState("");
  const [headers, setHeaders] = useState([]);
  const [hasPdf, setHasPdf] = useState(false);
  const [mapping, setMapping] = useState(emptyMapping());
  const [products, setProducts] = useState([]);
  const [enrichment, setEnrichment] = useState({});
  const [error, setError] = useState("");

  const handleUploaded = (result) => {
    setSessionId(result.sessionId);
    setHeaders(result.headers);
    setBrand(result.brand || "");
    if (result.savedMapping) setMapping(result.savedMapping);
    setStep(2);
  };

  const handlePreview = async () => {
    setError("");
    try {
      const result = await buildProducts(sessionId, mapping, brand);
      setProducts(result.products);
      setEnrichment({});
      setStep(3);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="wrap">
      <div className="header">
        <p className="eyebrow">Maven &middot; wearemaven.co.uk</p>
        <h1 className="h1">Product Importer</h1>
        <p className="subtitle">Brand spreadsheet in, Shopify draft products out. Mappings are remembered per brand.</p>
      </div>

      <div className="steps">
        {STEP_LABELS.map(([n, label]) => (
          <div key={n} className={`step ${step === n ? "active" : ""}`}>
            <span className="step-num">{n}</span>
            {label}
          </div>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      {step === 1 && <UploadStep onUploaded={handleUploaded} onPdfUploaded={setHasPdf} />}

      {step === 1 && sessionId && (
        <div className="actions">
          <button className="btn btn-primary spacer" onClick={() => setStep(2)}>Continue to mapping</button>
        </div>
      )}

      {step === 2 && (
        <MappingStep
          sessionId={sessionId}
          headers={headers}
          brand={brand}
          mapping={mapping}
          setMapping={setMapping}
          onBack={() => setStep(1)}
          onContinue={handlePreview}
        />
      )}

      {step === 3 && (
        <PreviewStep
          sessionId={sessionId}
          products={products}
          hasPdf={hasPdf}
          enrichment={enrichment}
          setEnrichment={setEnrichment}
          onBack={() => setStep(2)}
          onContinue={() => setStep(4)}
        />
      )}

      {step === 4 && (
        <PushStep
          sessionId={sessionId}
          brand={brand}
          products={products}
          enrichment={enrichment}
          onBack={() => setStep(3)}
        />
      )}
    </div>
  );
}
