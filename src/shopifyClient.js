// Server-side Shopify Admin GraphQL client.
//
// This is the piece that structurally can't exist inside the browser artifact:
// it authenticates with a token that lives only in this process's environment
// and is never sent to a browser. See README.md for how to obtain the token.

const REQUIRED_ENV = ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_API_TOKEN"];

function assertConfigured() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Shopify client is not configured. Missing env vars: ${missing.join(", ")}. Copy .env.example to .env and fill them in.`
    );
  }
}

function endpoint() {
  const version = process.env.SHOPIFY_API_VERSION || "2025-01";
  return `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${version}/graphql.json`;
}

async function shopifyGraphQL(query, variables = {}) {
  assertConfigured();
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN,
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
      sku: v.sku,
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
