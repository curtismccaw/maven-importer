async function asJson(res) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function uploadSpreadsheet(file, brand) {
  const form = new FormData();
  form.append("file", file);
  if (brand) form.append("brand", brand);
  return asJson(await fetch("/api/upload", { method: "POST", body: form }));
}

export async function uploadZip(sessionId, file) {
  const form = new FormData();
  form.append("file", file);
  return asJson(await fetch(`/api/zip/${sessionId}`, { method: "POST", body: form }));
}

export async function uploadPdf(sessionId, file) {
  const form = new FormData();
  form.append("file", file);
  return asJson(await fetch(`/api/pdf/${sessionId}`, { method: "POST", body: form }));
}

export async function suggestMapping(sessionId) {
  return asJson(await fetch(`/api/mapping/suggest/${sessionId}`, { method: "POST" }));
}

export async function listTemplateBrands() {
  return asJson(await fetch("/api/templates"));
}

export async function getTemplate(brand) {
  const res = await fetch(`/api/templates/${encodeURIComponent(brand)}`);
  if (res.status === 404) return null;
  return asJson(res);
}

export async function saveTemplate(brand, mapping) {
  return asJson(
    await fetch(`/api/templates/${encodeURIComponent(brand)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping }),
    })
  );
}

export async function buildProducts(sessionId, mapping, brand) {
  return asJson(
    await fetch(`/api/products/build/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping, brand }),
    })
  );
}

export async function enrichProduct(sessionId, productIndex) {
  return asJson(await fetch(`/api/enrich/${sessionId}/${productIndex}`, { method: "POST" }));
}

export async function simplifyColors(sessionId) {
  return asJson(await fetch(`/api/colors/simplify/${sessionId}`, { method: "POST" }));
}

export async function pushProduct(sessionId, productIndex) {
  return asJson(await fetch(`/api/push/${sessionId}/${productIndex}`, { method: "POST" }));
}

export function exportCsvUrl(sessionId) {
  return `/api/export/csv/${sessionId}`;
}
