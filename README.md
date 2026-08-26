## What this app does

Full pipeline: upload a brand spreadsheet (or PDF for New Works) → map columns → group into products → curate a selection → either push to Shopify as drafts, or export a Shopify bulk-import CSV. Includes zip-based local image matching for the three brands with no usable image feed (&Tradition, Moebe, FRAMA), matched to variants by SKU.

## IMPORTANT: network access for testing

This was built and tested in a sandboxed environment that could reach npm registries but **not** `*.myshopify.com` or `api.anthropic.com`. That means:

- The parsing/mapping/grouping logic, the full upload → mapping → preview flow, zip-based image matching, and CSV export have all been run and verified end-to-end through the real HTTP API and a real running server (not just unit-style tests) — see "What's actually been tested" below.
- The Shopify push path (`src/shopifyClient.js`, `/api/push`) has been exercised against this sandbox and fails with a clean, expected `403 Host not in allowlist` error, confirming the code path runs correctly end-to-end and fails only because of this environment's network restriction, not a bug. It has **not** been proven against a real reachable Shopify store. Run `/api/shopify-check` first on wherever you deploy this, before trusting it with a real batch.

## What's actually been tested

| Feature | How it was verified |
|---|---|
| Upload → mapping → preview (Muuto) | Real HTTP calls against the real file, 447 products / 1,875 variants, matches validated numbers exactly |
| FRAMA bundle-price summing | Real HTTP calls, 658 priced + 47 flagged incomplete, confirmed SKU 11327 is among the flagged ones |
| Zip-based image matching | Uploaded a real zip with test images named after real FRAMA SKUs (6274, 2124) alongside the real FRAMA file; confirmed 2/3 matched by SKU (the third, an intentionally unrelated filename, correctly didn't match), confirmed the resulting image URL is genuinely fetchable from the server, and confirmed it appears correctly in a pushed product's payload |
| CSV export | Exported both the full product list and a filtered subset by index, confirmed valid Shopify bulk-import CSV with correct handles, variant rows, and image URLs |
| Error handling | Push without a preview, HAY without a category, missing Anthropic key, unknown brand — all return clean errors, nothing crashes |
| Full app (frontend + backend, one process) | Built the frontend, booted the combined server, confirmed the UI, static assets, and API all serve correctly from one origin |
| Shopify push | Confirmed it fails with the *expected* network error in this sandbox (`403 Host not in allowlist`) — proves the code path runs correctly, but the actual write to Shopify is unproven until run somewhere with real network access |

## Quick start (local)

```bash
# Backend
npm install
cp .env.example .env
# edit .env: SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_API_TOKEN, ANTHROPIC_API_KEY
# PUBLIC_BASE_URL only needed if testing zip image upload — see below

# Frontend
cd frontend
npm install
npm run build      # outputs frontend/dist
cd ..

# Run everything from one process
npm start
# -> open http://localhost:3000
```

`npm run dev` (backend) plus `cd frontend && npm run dev` (in a second terminal) runs them separately during active frontend development — Vite serves the UI on :5173 and proxies `/api` calls to the backend on :3000 (see `frontend/vite.config.js`). For anything past active UI development, build once and run the single combined process above, it's simpler to deploy.

### Getting a Shopify Admin API token

1. In the target store admin: Settings > Apps and sales channels > Develop apps.
2. Create an app, grant it `write_products` and `write_inventory` scopes.
3. Install the app, copy the Admin API access token into `.env`.
4. To move from sandbox to the live store, swap `SHOPIFY_STORE_DOMAIN` and the token — nothing else needs to change.

### Zip-based image matching (&Tradition, Moebe, FRAMA)

These three brands have no usable image feed in their source spreadsheets (see `brand-mapping-notes.md`), so Step 1 in the UI shows a second file input for a zip of images when one of those brands is selected. Name each image file after its SKU (e.g. `2124.jpg`); matching is case-insensitive and ignores the extension. Files that don't match any SKU are silently skipped, not treated as an error.

**This requires `PUBLIC_BASE_URL`** in `.env` to be set to this app's real, publicly reachable address (e.g. `https://maven-importer.onrender.com`) — Shopify's servers need to fetch the image from a real URL, so `localhost` will not work once you're actually pushing to Shopify. The preview step will refuse to run with a clear error if a zip was uploaded but `PUBLIC_BASE_URL` isn't set. Images are extracted to `data/images/<uploadId>/` and served by this same app at `/local-images/<uploadId>/<filename>`.

### CSV export

Step 4 has a "Download CSV" button that exports a Shopify bulk-import CSV (`GET /api/export/:uploadId?indexes=0,1,2`) for the currently curated selection — the same product data used for the live push, so it's a genuine alternative path, e.g. a manual review pass, or for brands you're not ready to push live yet.

## Deploying somewhere real

This is a normal long-running Node/Express process (not serverless functions), so it fits hosts like **Render, Railway, or Fly.io** with no code changes:

1. Push this to a Git repo.
2. On the host: set the build command to `npm install && cd frontend && npm install && npm run build && cd ..`, and the start command to `npm start`.
3. Set the environment variables (`SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_API_TOKEN`, `SHOPIFY_API_VERSION`, `ANTHROPIC_API_KEY`, `PUBLIC_BASE_URL`, `PORT`) in the host's dashboard, not in a committed `.env`. **`PUBLIC_BASE_URL` should be set to the URL the host gives you** (e.g. `https://your-app-name.onrender.com`) if you'll use zip-based image uploads.
4. Deploy, then visit the given URL and run through Step 1–4 in the UI, or hit `/api/shopify-check` directly first to confirm credentials work before touching any brand files.

**Vercel/Netlify specifically**: this will run there, but it's a poor fit as built. Both platforms run code as short-lived serverless functions with a read-only filesystem outside `/tmp`, and this backend's storage (`src/storage/store.js`) and zip-extracted images (`data/images/`) both write to disk, and the push route deliberately runs slowly (rate-limited product-by-product with image-confirmation polling), which risks hitting serverless execution time limits on a real batch. Render/Railway/Fly.io run this as a normal always-on process, matching how it's built, with zero changes needed.

## Running the smoke test

```bash
node test/smoke.js
```


This runs the parsing → mapping → grouping pipeline against real Muuto and FRAMA files already in `data/`, with no Shopify calls, and checks it against numbers already validated manually (447 Muuto products, 350 multi-variant; FRAMA's bundle-summing behaviour). Add more brand files to `data/` and extend this test as more brands get ported over.

## API

| Route | Purpose |
|---|---|
| `GET /api/health` | Liveness check, lists supported brands |
| `GET /api/shopify-check` | Confirms Shopify credentials work — run this first |
| `POST /api/upload` | Upload a brand file (multipart: `file`, `brand`, `category?`). Returns `uploadId`, headers, saved mapping if one exists |
| `POST /api/mapping-suggest` | `{ uploadId }` → AI-suggested column mapping (needs `ANTHROPIC_API_KEY`) |
| `POST /api/mappings` | `{ brand, mapping }` → save a mapping for reuse next time |
| `GET /api/mappings/:brand` | Fetch a brand's saved mapping |
| `POST /api/preview` | `{ uploadId, mapping? }` → maps, groups, returns products for curation. Uses the brand's saved mapping if none is provided |
| `POST /api/push` | `{ uploadId, selectedIndexes: number[], status? }` → pushes only the selected products (this is where curation happens — see below) |
| `GET /api/push/:uploadId` | Retrieve the last push's results without re-pushing |

### Example flow

```bash
curl -F "file=@Muuto_Master_Data_cleaned.csv" -F "brand=Muuto" http://localhost:3000/api/upload
# -> { uploadId: "Muuto-1234", headers: [...], rowCount: 1875, savedMapping: null }

curl -X POST -H "Content-Type: application/json" -d '{
  "brand": "Muuto",
  "mapping": {
    "title": {"mode":"column","column":"PRODUCT"},
    "sku": {"mode":"column","column":"ITEM NO."},
    "price": {"mode":"column","column":"RETAIL PRICE"},
    "vendor": {"mode":"fixed","value":"Muuto"},
    "product_type": {"mode":"column","column":"CATEGORY"},
    "option1_name": {"mode":"fixed","value":"Colour"},
    "option1_value": {"mode":"column","column":"COLOR"},
    "image_url": {"mode":"column","column":"PACKSHOT IMAGE"}
  }
}' http://localhost:3000/api/mappings

curl -X POST -H "Content-Type: application/json" -d '{"uploadId":"Muuto-1234"}' http://localhost:3000/api/preview
# -> { productCount: 447, products: [{idx: 0, title: "...", variantCount: 2, ...}, ...] }

curl -X POST -H "Content-Type: application/json" -d '{"uploadId":"Muuto-1234","selectedIndexes":[0,1,2],"status":"DRAFT"}' http://localhost:3000/api/push
```

## Curation (why `/api/push` takes `selectedIndexes`)

Maven curates a selection per brand rather than listing a brand's full range (confirmed with the client). This backend implements curation the same way the artifact's Step 3 checkbox UI did: `/api/preview` returns every grouped product with an index, and only the indexes passed to `/api/push` get created in Shopify. Nothing is pushed automatically.

This is deliberately UI-only for now (see the open design decisions in `maven-backend-scope.md`): there's no persisted include/exclude list per brand yet. If Maven wants their selections to persist between runs rather than being re-picked each time, that's a small addition to `src/storage/store.js` (a `selections` namespace, same pattern as `mappings`), not a structural change.

## Brand status in this codebase

| Brand | Status |
|---|---|
| Muuto | Implemented and verified (447 products, 350 multi-variant, matches manual validation exactly) |
| &Tradition | Implemented (title-based grouping), not yet run against a real &Tradition file — the CSVs available during this build were Muuto and FRAMA only |
| Moebe | Implemented (simple one-row-per-product grouping), same caveat as &Tradition |
| FRAMA | Implemented **with bundle-price summing** (see below), verified against the real file: 658 products price cleanly, 47 are flagged as incomplete (see "New finding" below) |
| HAY Lighting | Implemented (title-based, two options, de-dupes the 3 known duplicate SKU pairs), not yet run against a real file |
| HAY Furniture | **Not implemented.** `groupHayFurniture()` throws intentionally — this needs a data-shape decision (curated subset vs. coarser grouping vs. swatch metafields) before it can be written at all, per `brand-mapping-notes.md` |
| New Works | **Placeholder only.** `src/parsers/pdf.js` has a rough row-extraction regex, not the actual layout logic proven during sandbox testing with `pdftotext -layout`. This needs the real parsing approach ported in, plus the Spare Parts section (unimplemented) and the EUR/GBP label question resolved first |

### FRAMA bundle-price summing — new finding

The bundle logic in `src/grouping/frama.js` sums each component row's own standalone price × quantity to get the bundle total (confirmed correct by cross-referencing component SKUs against their own standalone price rows). Running it against the real file surfaces **47 bundle groups where at least one component has no listed price** (SKU `11327`, the one already known about, is one of these 47, not the only one). These are flagged and excluded from the pushable product list rather than silently underpriced — worth a proper data-cleanup pass with FRAMA before go-live, not just the single SKU flagged previously.

## Known limitations / things to fix before production use

1. **Shopify push path is unverified against a live store** — see the note at the top of this file. Run `/api/shopify-check` and a single test push before trusting this with a real batch.
2. **`xlsx` (SheetJS) has two known, currently-unpatched vulnerabilities** (prototype pollution, ReDoS) per `npm audit`. Since input files come from known brand partners rather than untrusted public uploads, this is a lower-risk profile, but worth knowing about. SheetJS's own recommendation is to install their CDN-distributed build instead of the npm package if this matters more once this is public-facing.
3. **Storage is a flat JSON file per namespace** (`data/mappings.json`, `data/uploads.json`, etc.), fine for one operator, not for concurrent use. Swap for a real database if Maven ever gets self-serve access.
4. **No auth on the API itself.** This assumes it runs somewhere only Jaime (and eventually Maven, if that's the direction chosen) can reach it. Add an API key or proper auth before exposing it beyond localhost/a private network.
5. **New Works PDF parsing is a placeholder**, not the validated logic from sandbox testing. Do not run this against a real New Works file expecting correct output yet.
6. **HAY Furniture grouping is unimplemented by design**, pending the data-shape decision.
7. **Rate limiting is a fixed delay** (`PUSH_INTERVAL_MS`, default 600ms) rather than reading Shopify's actual cost-based throttle response. Fine for the batch sizes discussed so far; worth revisiting if pushing hundreds of products at once.

## File structure

```
server.js                     Express entrypoint
src/
  shopifyClient.js             Shopify Admin GraphQL client (server-side auth)
  aiMapping.js                 Server-side AI-assisted column mapping (Anthropic API)
  parsers/
    spreadsheet.js              xlsx/csv reading + generic field mapping
    pdf.js                       New Works PDF parsing (placeholder, see above)
  grouping/
    index.js                     brand dispatcher
    simple.js                    Moebe (one-row-per-product)
    frama.js                     FRAMA (bundle-price summing)
    atradition.js                 &Tradition (title-based grouping)
    muuto.js                      Muuto (Family+Type+Model grouping)
    hay.js                         HAY Lighting (implemented) / Furniture (stubbed, throws)
  storage/
    store.js                      flat-file JSON storage (mappings, uploads, previews, push results)
  routes/
    upload.js, preview.js, push.js
test/
  smoke.js                        parsing/grouping smoke test against real files, no Shopify calls
data/                            sample files for the smoke test + JSON storage
```
