# Maven Product Importer Backend

Server-side replacement for the browser artifact's chat-handoff push mechanism. This authenticates to Shopify directly with its own credentials, so pushing products becomes an API call instead of a conversation.

## IMPORTANT: network access for testing

This was built and smoke-tested in a sandboxed environment that could reach npm registries but **not** `*.myshopify.com` or `api.anthropic.com`. That means:

- The parsing/mapping/grouping logic (`test/smoke.js`) has been run and verified against real Muuto and FRAMA files.
- The Shopify push path (`src/shopifyClient.js`, `/api/push`) has **not** been exercised against a live store from this environment. It's written directly against the GraphQL shapes that were manually proven working in chat (`productCreate` + `productVariantsBulkCreate`, partial variant sets, image re-hosting confirmation), but needs a real first run against the sandbox store before trusting it with a real batch.

**First thing to do after installing**: run `npm run dev`, then `curl http://localhost:3000/api/shopify-check`. If that returns your shop info, the credential wiring works and everything downstream should follow the same pattern that was already proven manually.

## Setup

```bash
npm install
cp .env.example .env
# edit .env: fill in SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_API_TOKEN, ANTHROPIC_API_KEY
npm run dev
```

### Getting a Shopify Admin API token

1. In the sandbox store admin: Settings > Apps and sales channels > Develop apps.
2. Create an app, grant it `write_products` and `write_inventory` scopes.
3. Install the app, copy the Admin API access token into `.env`.
4. When ready to point at the live store, swap `SHOPIFY_STORE_DOMAIN` and the token — nothing else in the code needs to change, this was a deliberate design goal.

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
