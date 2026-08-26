// Server-side Shopify Admin GraphQL client.
//
// This is the piece that structurally can't exist inside the browser artifact:
// it authenticates with a token that lives only in this process's environment
// and is never sent to a browser. See README.md for how to obtain credentials.
//
// Custom apps created since Shopify's Jan 2026 change no longer hand out a
// static shpat_ admin token — instead they give a client ID + client secret,
// exchanged at runtime for a short-lived (24h) access token via the
// "client credentials grant" flow. That token is cached here and refreshed
// on expiry. If SHOPIFY_ADMIN_API_TOKEN is set (older custom apps still using
// a static token), it's used directly and no exchange happens.

function assertConfigured() {
  if (!process.env.SHOPIFY_STORE_DOMAIN) {
    throw new Error(
      "Shopify client is not configured. Missing env var: SHOPIFY_STORE_DOMAIN. Copy .env.example to .env and fill it in."
    );
  }
  const hasStaticToken = !!process.env.SHOPIFY_ADMIN_API_TOKEN;
  const hasClientCredentials = !!process.env.SHOPIFY_API_KEY && !!process.env.SHOPIFY_API_SECRET;
  if (!hasStaticToken && !hasClientCredentials) {
    throw new Error(
      "Shopify client is not configured. Set either SHOPIFY_ADMIN_API_TOKEN, or both SHOPIFY_API_KEY and SHOPIFY_API_SECRET, in .env."
    );
  }
}

function endpoint() {
  const version = process.env.SHOPIFY_API_VERSION || "2025-01";
  return `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${version}/graphql.json`;
}

// Cached client-credentials access token, refreshed shortly before it expires.
let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function fetchClientCredentialsToken() {
  const res = await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shopify OAuth token exchange failed (HTTP ${res.status}): ${text.slice(0, 500)}`);
  }

  const json = await res.json();
  cachedToken = json.access_token;
  // Refresh a minute early to avoid racing the real expiry.
  cachedTokenExpiresAt = Date.now() + (json.expires_in - 60) * 1000;
  return cachedToken;
}

async function getAccessToken() {
  if (process.env.SHOPIFY_ADMIN_API_TOKEN) {
    return process.env.SHOPIFY_ADMIN_API_TOKEN;
  }
  if (cachedToken && Date.now() < cachedTokenExpiresAt) {
    return cachedToken;
  }
  return fetchClientCredentialsToken();
}

async function shopifyGraphQL(query, variables = {}) {
  assertConfigured();
  const accessToken = await getAccessToken();
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shopify API HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// NOTE: productOptions.values below causes Shopify to auto-generate one
// variant per value combination AS PART OF THIS MUTATION, at price 0.00
// with no SKU. That's Shopify's documented behaviour, not a bug on our
// side, so createProduct() below has to reconcile against whatever gets
// auto-created rather than assuming a clean slate. selectedOptions is
// included here specifically so that reconciliation can match auto-created
// variants back to the real variants we actually want to push.
const PRODUCT_CREATE_MUTATION = `
  mutation productCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product {
        id
        title
        status
        variants(first: 100) {
          nodes { id title sku price selectedOptions { name value } }
        }
      }
      userErrors { field message }
    }
  }
`;

// Variants can't be set directly on productCreate along with options in the
// same call in all API versions; the reliable two-step path is:
//   1. productCreate with title/vendor/type/status/tags/descriptionHtml + options
//   2. reconcile: productVariantsBulkUpdate for variants Shopify already
//      auto-created from productOptions.values, productVariantsBulkCreate
//      only for combinations that don't already exist
// This mirrors what was proven manually against the sandbox in chat, with
// the reconciliation step added after diagnosing the "variant already
// exists" collision (Airy Coffee Table batch, 2026-08-26).
const PRODUCT_VARIANTS_BULK_CREATE_MUTATION = `
  mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants { id title sku price }
      userErrors { field message }
    }
  }
`;

const PRODUCT_VARIANTS_BULK_UPDATE_MUTATION = `
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id title sku price }
      userErrors { field message }
    }
  }
`;

const PRODUCT_QUERY = `
  query getProduct($id: ID!) {
    product(id: $id) {
      id
      title
      status
      featuredImage { url }
      images(first: 20) { nodes { url altText } }
      variants(first: 100) { nodes { id title sku price } }
    }
  }
`;

/**
 * Create a product with variants and images.
 * @param {object} product - { title, vendor, productType, status, tags, descriptionHtml, options: string[] }
 * @param {Array<{price, sku, optionValues: [{optionName, name}]}>} variants
 * @param {Array<{url, altText}>} images
 */
export async function createProduct({ product, variants, images }) {
  const createData = await shopifyGraphQL(PRODUCT_CREATE_MUTATION, {
    product: {
      title: product.title,
      vendor: product.vendor,
      productType: product.productType,
      status: product.status || "DRAFT",
      tags: product.tags || [],
      descriptionHtml: product.descriptionHtml || "",
      productOptions: (product.options || ["Title"]).map((name) => ({
        name,
        values: [...new Set(variants.map((v) =>
          (v.optionValues || []).find((ov) => ov.optionName === name)?.name
        ).filter(Boolean))].map((value) => ({ name: value })),
      })),
    },
    media: (images || []).map((img) => ({
      originalSource: img.url,
      alt: img.altText || "",
      mediaContentType: "IMAGE",
    })),
  });

  const errors = createData.productCreate.userErrors;
  if (errors && errors.length) {
    throw new Error(`productCreate failed: ${JSON.stringify(errors)}`);
  }
  const created = createData.productCreate.product;

  // --- Reconciliation ---
  // Shopify has already auto-created one variant per value we listed in
  // productOptions above, each at price 0.00 with no SKU. Build a lookup
  // keyed on selectedOptions so we can tell which of our real variants
  // collide with an auto-created one (needs productVariantsBulkUpdate to
  // set the real price/SKU) versus which are genuinely new (needs
  // productVariantsBulkCreate).
  const keyOf = (optionValues) =>
    (optionValues || []).map((ov) => ov.name).join(" / ");

  const existingByKey = new Map(
    created.variants.nodes.map((v) => [
      (v.selectedOptions || []).map((o) => o.value).join(" / "),
      v,
    ])
  );

  const toCreate = [];
  const toUpdate = [];

  for (const v of variants) {
    const key = keyOf(v.optionValues);
    const match = existingByKey.get(key);
    const payload = {
      price: v.price,
      inventoryItem: v.sku ? { sku: v.sku, tracked: true } : undefined,
    };
    if (match) {
      toUpdate.push({ id: match.id, ...payload });
    } else {
      toCreate.push({ ...payload, optionValues: v.optionValues });
    }
  }

  const resultVariants = [];

  if (toCreate.length) {
    const createRes = await shopifyGraphQL(PRODUCT_VARIANTS_BULK_CREATE_MUTATION, {
      productId: created.id,
      variants: toCreate,
    });
    const variantErrors = createRes.productVariantsBulkCreate.userErrors;
    if (variantErrors && variantErrors.length) {
      throw new Error(`productVariantsBulkCreate failed: ${JSON.stringify(variantErrors)}`);
    }
    resultVariants.push(...createRes.productVariantsBulkCreate.productVariants);
  }

  if (toUpdate.length) {
    const updateRes = await shopifyGraphQL(PRODUCT_VARIANTS_BULK_UPDATE_MUTATION, {
      productId: created.id,
      variants: toUpdate,
    });
    const variantErrors = updateRes.productVariantsBulkUpdate.userErrors;
    if (variantErrors && variantErrors.length) {
      throw new Error(`productVariantsBulkUpdate failed: ${JSON.stringify(variantErrors)}`);
    }
    resultVariants.push(...updateRes.productVariantsBulkUpdate.productVariants);
  }

  return {
    id: created.id,
    title: created.title,
    status: created.status,
    variants: resultVariants,
  };
}

/** Fetch a product to confirm images actually re-hosted (they can return
 * empty immediately at creation time even with valid URLs). */
export async function getProduct(id) {
  const data = await shopifyGraphQL(PRODUCT_QUERY, { id });
  return data.product;
}

/** Poll get-product until images show up or the timeout elapses.
 * Returns { confirmed: boolean, product }. */
export async function confirmImages(id, { timeoutMs = 15000, intervalMs = 2000 } = {}) {
  const start = Date.now();
  let product = await getProduct(id);
  while (Date.now() - start < timeoutMs) {
    if (product.images?.nodes?.length > 0) {
      return { confirmed: true, product };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    product = await getProduct(id);
  }
  return { confirmed: false, product };
}

export async function getShopInfo() {
  const data = await shopifyGraphQL(`
    query { shop { name myshopifyDomain currencyCode plan { displayName } } }
  `);
  return data.shop;
}
