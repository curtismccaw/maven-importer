const path = require("path");
// Resolve .env relative to this file's location, not the process's current
// working directory. Without this, starting the server from anywhere other
// than the project root (a process manager, a different cwd, a Docker
// WORKDIR, a systemd unit) silently finds no .env at all — every variable
// comes back undefined, producing a "must be set" error even when .env is
// correctly filled out sitting right there in the project folder.
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.use("/api", require("./routes/upload"));
app.use("/api", require("./routes/zip"));
app.use("/api", require("./routes/pdf"));
app.use("/api", require("./routes/mapping"));
app.use("/api", require("./routes/products"));
app.use("/api", require("./routes/enrich"));
app.use("/api", require("./routes/colors"));
app.use("/api", require("./routes/push"));
app.use("/api", require("./routes/export"));

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Single-process deploy: Express serves the built Vite frontend alongside the
// API, so there's one thing to run and one port to expose.
const distPath = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(distPath));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(distPath, "index.html"), (err) => {
    if (err) res.status(404).send("Frontend build not found. Run `npm run build` first.");
  });
});

// Centralised error handler as a fallback for anything that slips past a
// route's own try/catch.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Maven product importer listening on http://localhost:${PORT}`);
});
