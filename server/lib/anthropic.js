// Server-side wrapper around the Anthropic Messages API. Keeping this on the
// backend (rather than calling api.anthropic.com from the browser, as the
// original artifact prototype did) means the API key stays server-side and
// never ships to the client bundle.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const PLACEHOLDER_KEY = "sk-ant-...";

async function askClaude(prompt, { maxTokens = 1000 } = {}) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set on the server. Add it to .env and restart the server (env changes are only read at startup).");
  }
  if (apiKey === PLACEHOLDER_KEY) {
    throw new Error("ANTHROPIC_API_KEY in .env is still the placeholder value from .env.example. Replace it with a real key from console.anthropic.com and restart the server.");
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
    if (response.status === 401 || data.error.type === "authentication_error") {
      // The key that was actually loaded, masked, so it's possible to tell
      // "did my .env change even take effect" from "is the key itself wrong"
      // without ever logging the real secret.
      const masked = apiKey.length > 10 ? `${apiKey.slice(0, 10)}...${apiKey.slice(-4)}` : "(very short — likely not a real key)";
      throw new Error(
        `Anthropic rejected this API key as invalid (loaded key: ${masked}). Check that: (1) it's a real, current key from console.anthropic.com, not one that's been rolled/revoked, (2) .env has no extra quotes or trailing spaces around it, (3) the server was actually restarted after the .env edit — Node only reads .env at startup, editing it while the server is running has no effect.`
      );
    }
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
