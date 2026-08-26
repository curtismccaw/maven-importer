// Server-side replacement for the artifact's in-browser aiAutoMap(). Same
// prompt strategy, but called with a real server-side API key instead of an
// unauthenticated fetch from the browser.
const FIELD_KEYS = [
  "title", "body_html", "vendor", "product_type", "tags", "sku", "price",
  "compare_at_price", "option1_name", "option1_value", "option2_name",
  "option2_value", "image_url",
];

export async function suggestMapping(headers, sampleRows) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set; AI-assisted mapping is unavailable. Map columns manually via the mappings storage instead.");
  }

  const prompt = `Spreadsheet headers: ${JSON.stringify(headers)}
Sample rows: ${JSON.stringify(sampleRows.slice(0, 3))}

Map each of these Shopify fields to the best-matching header from the list above, or null if nothing fits: ${FIELD_KEYS.join(", ")}.
Respond with ONLY a raw JSON object like {"title": "Product Name", "price": "RRP", "sku": null, ...}. No markdown, no explanation, no code fences.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find((c) => c.type === "text");
  if (!textBlock) throw new Error("No text response from Anthropic API");

  const clean = textBlock.text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);

  // Convert into the { mode, column } shape used elsewhere in this codebase.
  const mapping = {};
  for (const key of FIELD_KEYS) {
    const col = parsed[key];
    mapping[key] = col && headers.includes(col)
      ? { mode: "column", column: col, value: "" }
      : { mode: "none", column: "", value: "" };
  }
  return mapping;
}
