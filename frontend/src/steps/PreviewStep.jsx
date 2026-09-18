import React, { useState } from "react";
import { enrichProduct } from "../api";

export default function PreviewStep({ sessionId, products, hasPdf, enrichment, setEnrichment, onBack, onContinue }) {
  const [enriching, setEnriching] = useState(false);
  const [status, setStatus] = useState({}); // idx -> "pending" | "done" | "failed"

  const enrichAll = async () => {
    setEnriching(true);
    const BATCH = 3;
    for (let i = 0; i < products.length; i += BATCH) {
      const batch = products.slice(i, i + BATCH);
      await Promise.allSettled(
        batch.map(async (_, j) => {
          const idx = i + j;
          setStatus((s) => ({ ...s, [idx]: "pending" }));
          try {
            const result = await enrichProduct(sessionId, idx);
            setEnrichment((e) => ({ ...e, [idx]: result.enrichment }));
            setStatus((s) => ({ ...s, [idx]: result.enrichment.flagged ? "failed" : "done" }));
          } catch (err) {
            setStatus((s) => ({ ...s, [idx]: "failed" }));
          }
        })
      );
    }
    setEnriching(false);
  };

  const totalVariants = products.reduce((a, p) => a + p.variants.length, 0);
  const enrichedCount = Object.keys(enrichment).length;
  const flaggedCount = Object.values(enrichment).filter((e) => e.flagged).length;

  return (
    <div className="card">
      <div className="actions" style={{ marginTop: 0, marginBottom: 16 }}>
        <p className="note" style={{ margin: 0 }}>
          {products.length} products, {totalVariants} variants total. These will be created as drafts, nothing goes live automatically.
        </p>
        <button className="btn btn-dark spacer" onClick={enrichAll} disabled={enriching}>
          {enriching ? "Enriching..." : "Enrich content with AI"}
        </button>
      </div>
      {!hasPdf && (
        <p className="note warn">
          No brand fact sheet uploaded (step 1). Enrichment can still generate SEO/alt text from the existing spreadsheet
          data, but won't add any new specification claims, upload a fact sheet first if you want richer copy.
        </p>
      )}
      {enrichedCount > 0 && (
        <p className="note">{enrichedCount}/{products.length} products enriched. {flaggedCount} flagged for manual review.</p>
      )}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Vendor</th>
              <th>Variants</th>
              <th>Price range</th>
              <th>Images</th>
              <th>Content</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => {
              const prices = p.variants.map((v) => parseFloat(v.price) || 0);
              const min = Math.min(...prices);
              const max = Math.max(...prices);
              const withImage = p.variants.filter((v) => v.imageCount > 0 || v.image_url).length;
              const anyFuzzy = p.variants.some((v) => v.image_match_type === "fuzzy" || v.image_match_type === "fallback");
              const est = status[i];
              const enr = enrichment[i];
              return (
                <tr key={i}>
                  <td>{p.title}</td>
                  <td className="muted">{p.vendor}</td>
                  <td className="muted">{p.variants.length}</td>
                  <td className="muted">{min === max ? `£${min}` : `£${min} - £${max}`}</td>
                  <td className={withImage < p.variants.length || anyFuzzy ? "amber" : "muted"}>
                    {withImage}/{p.variants.length} matched{anyFuzzy && withImage === p.variants.length ? " (fuzzy)" : ""}
                  </td>
                  <td>
                    {!est && <span className="muted">not enriched</span>}
                    {est === "pending" && <span className="amber">enriching...</span>}
                    {est === "done" && <span className="green">ready</span>}
                    {est === "failed" && <span className="red" title={enr && enr.flag_reason}>flagged</span>}
                  </td>
                  <td className="muted">{(p.flags || []).join("; ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="actions">
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn btn-primary spacer" onClick={onContinue}>Continue to push</button>
      </div>
    </div>
  );
}
