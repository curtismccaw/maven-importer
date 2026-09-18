// Real Shopify Admin GraphQL calls using a stored access token, replacing the
// earlier prototype's approach of asking a chat-connected MCP tool to push
// products (which only worked interactively and couldn't run headless).
//
// Key behaviours confirmed during earlier testing, preserved here:
// - productVariantsBulkCreate needs the SKU nested as inventoryItem: { sku, tracked },
//   not as a top-level field.
// - productCreate returns images: [] immediately even with valid URLs, since
//   Shopify fetches them asynchronously. We don't block on that; a follow-up
//   productGet (not implemented here) would be needed to confirm attachment.
// - Tags auto-split on commas, so multi-clause tags must avoid commas.
// - Local (zip) images have no public URL, so they go through
//   stagedUploadsCreate + an upload POST before productCreateMedia can use them.
//   Remote CDN URLs (e.g. Muuto's occtoo-media.com) skip staging entirely.

function shopifyConfig() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2024-10";
  if (!domain || !token) {
    throw new Error("SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN must be set on the server (.env).");
  }
  return { domain, token, apiVersion };
}

async function shopifyGraphQL(query, variables) {
  const { domain, token, apiVersion } = shopifyConfig();
  const res = await fetch(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

async function stageAndUploadImage(buffer, mimeType, filename) {
  const stageResult = await shopifyGraphQL(
    `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      input: [
        {
          resource: "IMAGE",
          filename,
          mimeType,
          httpMethod: "POST",
        },
      ],
    }
  );
  const { userErrors, stagedTargets } = stageResult.stagedUploadsCreate;
  if (userErrors && userErrors.length) throw new Error(`Staged upload error: ${JSON.stringify(userErrors)}`);
  const target = stagedTargets[0];

  const form = new FormData();
  target.parameters.forEach((p) => form.append(p.name, p.value));
  form.append("file", new Blob([buffer], { type: mimeType }), filename);

  const uploadRes = await fetch(target.url, { method: "POST", body: form });
  if (!uploadRes.ok) {
    throw new Error(`Image upload to Shopify's staged URL failed with status ${uploadRes.status}`);
  }
  return target.resourceUrl;
}

// product: { title, body_html, vendor, product_type, tags, variants: [...] }
// Returns { productId, warnings: [] }
async function createDraftProduct(product) {
  const warnings = [];

  const createResult = await shopifyGraphQL(
    `mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product { id handle }
        userErrors { field message }
      }
    }`,
    {
      input: {
        title: product.title,
        descriptionHtml: product.body_html || "",
        vendor: product.vendor || "",
        productType: product.product_type || "",
        tags: (product.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
        status: "DRAFT",
      },
    }
  );
  const { userErrors, product: created } = createResult.productCreate;
  if (userErrors && userErrors.length) {
    throw new Error(`productCreate error: ${JSON.stringify(userErrors)}`);
  }
  const productId = created.id;

  const usesOptions = product.variants.some((v) => v.option1_name) || product.variants.length > 1;
  const variantInputs = product.variants.map((v) => {
    const options = [];
    if (usesOptions) options.push(v.option1_value || "Default Title");
    if (v.option2_value) options.push(v.option2_value);
    return {
      price: String(v.price || "0"),
      compareAtPrice: v.compare_at_price ? String(v.compare_at_price) : null,
      options: options.length ? options : ["Default Title"],
      inventoryItem: { sku: v.sku || undefined, tracked: true },
    };
  });

  if (usesOptions) {
    const optionNames = [product.variants[0].option1_name || "Title"];
    if (product.variants.some((v) => v.option2_value)) optionNames.push(product.variants[0].option2_name || "Option 2");
    await shopifyGraphQL(
      `mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) { product { id } userErrors { field message } }
      }`,
      { input: { id: productId, options: optionNames } }
    );
  }

  const variantResult = await shopifyGraphQL(
    `mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId: $productId, variants: $variants) {
        productVariants { id sku }
        userErrors { field message }
      }
    }`,
    { productId, variants: variantInputs }
  );
  if (variantResult.productVariantsBulkCreate.userErrors && variantResult.productVariantsBulkCreate.userErrors.length) {
    warnings.push(`Variant creation issues: ${JSON.stringify(variantResult.productVariantsBulkCreate.userErrors)}`);
  }

  // Attach images: local (zip) photos need staging first, remote URLs go straight in.
  const mediaInputs = [];
  for (const v of product.variants) {
    if (v.local_images && v.local_images.length) {
      for (const img of v.local_images) {
        try {
          const resourceUrl = await stageAndUploadImage(img.buffer, img.mimeType, `${v.sku || "image"}.jpg`);
          mediaInputs.push({ originalSource: resourceUrl, mediaContentType: "IMAGE" });
        } catch (e) {
          warnings.push(`Image upload failed for SKU ${v.sku}: ${e.message}`);
        }
      }
    } else if (v.image_url) {
      mediaInputs.push({ originalSource: v.image_url, mediaContentType: "IMAGE" });
    }
  }
  if (mediaInputs.length) {
    const mediaResult = await shopifyGraphQL(
      `mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { alt mediaContentType }
          mediaUserErrors { field message }
        }
      }`,
      { productId, media: mediaInputs }
    );
    if (mediaResult.productCreateMedia.mediaUserErrors && mediaResult.productCreateMedia.mediaUserErrors.length) {
      warnings.push(`Image attach issues: ${JSON.stringify(mediaResult.productCreateMedia.mediaUserErrors)}`);
    }
  } else {
    warnings.push("No images attached: no local match and no image URL for any variant.");
  }

  return { productId, handle: created.handle, warnings };
}

module.exports = { createDraftProduct, shopifyGraphQL };
