// Server-side wrapper around the Anthropic Messages API. Keeping this on the
// backend (rather than calling api.anthropic.com from the browser, as the
// original artifact prototype did) means the API key stays server-side and
// never ships to the client bundle.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

async function askClaude(prompt, { maxTokens = 1000 } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set on the server. Add it to .env and restart.");
  }
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || "Anthropic API error");
  }
  const textBlock = (data.content || []).find((c) => c.type === "text");
  if (!textBlock) throw new Error("Anthropic API returned no text content");
  return textBlock.text;
}

// Strips ```json fences and parses. Throws if the model didn't return valid JSON,
// callers should catch and fall back to a "needs manual review" state rather
// than silently trusting a malformed response.
function parseJsonResponse(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

module.exports = { askClaude, parseJsonResponse };
