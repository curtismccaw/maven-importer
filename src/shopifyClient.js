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

const PRODUCT_CREATE_MUTATION = `
  mutation productCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product {
        id
        title
        status
        variants(first: 100) {
          nodes { id title sku price }
        }
      }
      userErrors { field message }
    }
  }
`;

// Variants can't be set directly on productCreate along with options in the
// same call in all API versions; the reliable two-step path is:
//   1. productCreate with title/vendor/type/status/tags/descriptionHtml + options
//   2. productVariantsBulkCreate to add the priced/SKU'd variants
// This mirrors what was proven manually against the sandbox in chat.
//
// SKU lives under inventoryItem, not as a top-level field, on
// ProductVariantsBulkInput (it only exists top-level on the ProductVariant
// read type, not this mutation's input).
const PRODUCT_VARIANTS_BULK_CREATE_MUTATION = `
  mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
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

  // Shopify auto-creates one default variant on productCreate; remove/replace
  // path varies by API version. Simplest reliable approach: bulk-create the
  // real variants, matching what worked in manual sandbox testing.
  const variantData = await shopifyGraphQL(PRODUCT_VARIANTS_BULK_CREATE_MUTATION, {
    productId: created.id,
    variants: variants.map((v) => ({
      price: v.price,
      inventoryItem: v.sku ? { sku: v.sku, tracked: true } : undefined,
      optionValues: v.optionValues,
    })),
  });

  const variantErrors = variantData.productVariantsBulkCreate.userErrors;
  if (variantErrors && variantErrors.length) {
    throw new Error(`productVariantsBulkCreate failed: ${JSON.stringify(variantErrors)}`);
  }

  return {
    id: created.id,
    title: created.title,
    status: created.status,
    variants: variantData.productVariantsBulkCreate.productVariants,
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
