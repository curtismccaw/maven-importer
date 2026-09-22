import React, { useState } from "react";
import { pushProduct, exportCsvUrl } from "../api";

export default function PushStep({ sessionId, brand, products, enrichment, onBack }) {
  const [pushStatus, setPushStatus] = useState({});
  const [pushing, setPushing] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const doPush = async (idx) => {
    setAttempted(true);
    setPushStatus((s) => ({ ...s, [idx]: { status: "pushing", message: "" } }));
    try {
      const result = await pushProduct(sessionId, idx);
      setPushStatus((s) => ({ ...s, [idx]: result }));
    } catch (err) {
      setPushStatus((s) => ({ ...s, [idx]: { status: "failed", message: err.message } }));
    }
  };

  const pushAll = async () => {
    setPushing(true);
    setAttempted(true);
    const BATCH = 2;
    for (let i = 0; i < products.length; i += BATCH) {
      const batch = products.slice(i, i + BATCH);
      await Promise.allSettled(batch.map((_, j) => doPush(i + j)));
    }
    setPushing(false);
  };

  const manualCheckItems = products
    .map((p, i) => {
      const reasons = [];
      const st = pushStatus[i];
      if (st && st.status === "failed") reasons.push(`Push failed: ${st.message || "unknown error"}`);
      const missing = p.variants.filter((v) => !(v.imageCount > 0) && !v.image_url).length;
      const fuzzy = p.variants.filter((v) => v.image_match_type === "fuzzy" || v.image_match_type === "fallback").length;
      if (missing > 0) reasons.push(`${missing}/${p.variants.length} variant(s) have no matched photo`);
      else if (fuzzy > 0) reasons.push(`${fuzzy} variant(s) matched by fallback/fuzzy match, confirm the right photo attached`);
      if (p.flags && p.flags.length) p.flags.forEach((f) => reasons.push(f));
      const enr = enrichment[i];
      if (enr && enr.flagged) reasons.push(`Content flagged: ${enr.flag_reason || "insufficient source data in fact sheet"}`);
      return reasons.length ? { title: p.title, reasons } : null;
    })
    .filter(Boolean);

  return (
    <div className="card">
      <div className="actions" style={{ marginTop: 0, marginBottom: 16 }}>
        <p className="note" style={{ margin: 0 }}>Pushes 2 at a time to the Shopify Admin API, or push one product on its own with the button on its row. You can retry any that fail.</p>
        <div style={{ display: "flex", gap: 8 }} className="spacer">
          <a className="btn" href={exportCsvUrl(sessionId)}>Download CSV</a>
          <button className="btn btn-primary" onClick={pushAll} disabled={pushing}>
            {pushing ? "Pushing..." : `Push ${products.length} products`}
          </button>
        </div>
      </div>

      <div className="push-list">
        {products.map((p, i) => {
          const st = pushStatus[i];
          return (
            <div className="push-row" key={i}>
              <div>
                <span style={{ fontWeight: 500 }}>{p.title}</span>
                {st && st.message && <span className="hint" style={{ display: "block" }}>{st.message}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`badge badge-${st ? st.status : "waiting"}`}>{st ? st.status : "waiting"}</span>
                {(!st || st.status === "failed") && (
                  <button className="retry-link" onClick={() => doPush(i)} disabled={pushing}>
                    {st && st.status === "failed" ? "retry" : "push"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {attempted && !pushing && (
        <div className="check-summary">
          <h3>Needs manual check: {manualCheckItems.length} of {products.length} products</h3>
          {manualCheckItems.length === 0 ? (
            <p style={{ fontSize: 13, color: "#92400e" }}>
              Nothing flagged, every product pushed cleanly with a confident image match and no content flags.
            </p>
          ) : (
            manualCheckItems.map((item, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#92400e" }}>{item.title}</div>
                <ul>
                  {item.reasons.map((r, ri) => (
                    <li key={ri}>{r}</li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      <div className="actions">
        <button className="btn" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
