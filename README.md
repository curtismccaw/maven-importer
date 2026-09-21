# Maven Product Importer

Brand spreadsheet in, Shopify draft products out. Node/Express backend + React/Vite
frontend, served as a single deployable process.

## What it does

1. **Upload** a brand spreadsheet (.csv/.xlsx), optionally a .zip of product photos, and
   optionally a brand PDF fact sheet.
2. **Map columns** to the standard product fields, with an AI suggestion button and
   per-brand saved templates (stored in `server/data/templates.json`).
3. **Preview & enrich**: products are grouped (FRAMA and Muuto use their own confirmed
   grouping logic in `server/lib/brands/`, everything else uses the generic mapping-driven
   grouper), images are matched to variants by a cascade of SKU/colour/filename candidates,
   and you can run AI content enrichment (SEO title/description, alt text, FAQs) grounded
   only in the uploaded PDF fact sheet.
4. **Push**: creates each product as a Shopify draft via the Admin GraphQL API (staged
   upload for local zip photos, direct URL for remote CDN links), or download a Shopify
   bulk-import CSV instead. After pushing, a manual-check summary lists anything that
   needs a human look: failed pushes, missing/fuzzy image matches, and enrichment flags.
5. **Colour simplification**: an AI-assisted "Simplify colours" action in step 3 collapses
   verbose brand colour/finish names (e.g. "Midnight Blue", "Oak", "Anthracite Black")
   down to a fixed basic palette (Black, White, Grey, Beige, Brown, Red, Orange, Yellow,
   Green, Blue, Purple, Pink, Gold, Silver, Multicolor, Clear), for cleaner storefront
   filtering. Every classification is cached on disk (`server/data/color-map.json`), so
   the same colour value across any brand or any future import is only ever classified
   once. Applied as a `Colour: <canonical>` tag per product (works with any theme's
   filter out of the box) and, on export, written to the standard
   `Color (product.metafields.shopify.color-pattern)` CSV column at the product level —
   note that column only imports cleanly if that metafield is defined as plain text on
   the store; if it's set up as a metaobject-referenced swatch list, treat the CSV value
   as a manual-check hint rather than an automatic import. The Push (API) flow only sets
   the tag, not that metafield, to avoid a mismatched-type error breaking the push.

## Setup

```bash
cp .env.example .env
# fill in ANTHROPIC_API_KEY, SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN
npm install
npm run build        # builds the frontend into frontend/dist
npm start            # serves API + frontend on http://localhost:3000
```

For local development with hot reload on the frontend:

```bash
npm run dev:server   # terminal 1, http://localhost:3000
npm run dev:frontend # terminal 2, http://localhost:5173 (proxies /api to :3000)
```

## Notes on brand-specific logic

- **FRAMA** (`server/lib/brands/frama.js`): sums component prices for Bundle / Gift Box
  Bundle SKUs, flags incomplete pricing and duplicate SKUs. Needs client sign-off before
  this bundle approach goes live, per the open item in the brand notes.
- **Muuto** (`server/lib/brands/muuto.js`): groups by Family + Type + Model rather than
  the PRODUCT column, since Muuto bakes the colourway into that name.
- **HAY Furniture**: not yet given its own module. The generic grouper will flag any
  product over Shopify's 100-variant cap rather than silently truncating or splitting it,
  the configurator data-shape problem described in the brand notes still needs a decision
  before this brand can be onboarded properly.
- Every other brand (&Tradition, Moebe, HAY Lighting, New Works, and the 14 unseen ones)
  runs through the generic mapping-driven grouper in `server/lib/brands/generic.js`.

Add a new brand-specific module the same way FRAMA/Muuto are wired in
`server/lib/brands/index.js` if a brand's data shape needs more than a mapping template.

## Known limitations / things to firm up before relying on this in production

- Sessions are in-memory (`server/lib/sessions.js`) and expire after 6 hours or a server
  restart, only mapping templates persist to disk. Fine for one import run at a time;
  swap in Redis/SQLite if concurrent imports across the team become common.
- Image previews sent to the browser are full-resolution base64, not thumbnails. Add a
  resize step (e.g. with `sharp`) in `server/routes/products.js` if photo libraries get large.
- The CSV export can't embed local zip photos directly (CSV cells can't hold binary), it
  notes which file would be used and points to the Push flow for those. Push handles the
  actual Shopify image upload via staged uploads.
- AI content enrichment enforces "only use facts in the fact sheet" via prompt
  instructions and a `flagged` field, not a hard technical guarantee, spot-check flagged
  and unflagged output alike before it goes live, especially early on.
