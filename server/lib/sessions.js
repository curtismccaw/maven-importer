// Simple in-memory session store. This is an internal single-team tool, not a
// multi-tenant SaaS product, so we deliberately avoid a database: each browser
// tab gets a sessionId, and the server keeps that session's working state
// (uploaded rows, zip images, PDF text, built products) in memory until the
// process restarts. Good enough for one import run at a time; if concurrent
// imports across the team become common, swap this Map for Redis/SQLite.

const sessions = new Map();

const SESSION_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

function createSession() {
  const id = require("crypto").randomUUID();
  const session = {
    id,
    createdAt: Date.now(),
    brand: "",
    fileName: "",
    headers: [],
    rows: [],
    zipImages: {}, // normalizedKey -> { mimeType, buffer } (kept as Buffer, base64'd on demand)
    zipFileName: "",
    pdfText: "",
    pdfFileName: "",
    mapping: null,
    products: [], // built products, each with variants incl. image match info
    enrichment: {}, // productIndex -> enrichment result
    pushStatus: {}, // productIndex -> { status, message }
  };
  sessions.set(id, session);
  return session;
}

function getSession(id) {
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }
  return s;
}

function requireSession(id) {
  const s = getSession(id);
  if (!s) {
    const err = new Error("Session not found or expired. Start again from the upload step.");
    err.status = 404;
    throw err;
  }
  return s;
}

// Periodic cleanup so long-running processes don't accumulate stale sessions.
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 1000 * 60 * 30).unref();

module.exports = { createSession, getSession, requireSession };
