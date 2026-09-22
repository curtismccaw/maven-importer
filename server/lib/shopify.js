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

function getDomain() {
  const rawDomain = (process.env.SHOPIFY_STORE_DOMAIN || "").trim();
  if (!rawDomain) {
    throw new Error("SHOPIFY_STORE_DOMAIN must be set on the server (.env), then restart the server (env changes are only read at startup).");
  }
  // Catches the specific case of pasting a markdown-formatted link
  // ([text](url)) into a plain .env value, which silently produces a domain
  // string containing brackets/parentheses/a URL instead of a bare hostname.
  if (/[[\]()]/.test(rawDomain) || /^https?:\/\//i.test(rawDomain)) {
    throw new Error(
      `SHOPIFY_STORE_DOMAIN looks malformed: "${rawDomain}". It should be just the bare hostname with no brackets, parentheses, or "https://" prefix, e.g. maventest-hcpd88pt.myshopify.com. This usually happens from pasting a markdown-style link ([text](url)) into .env instead of plain text.`
    );
  }
  return rawDomain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

// --- Authentication ---
//
// Shopify deprecated static shpat_ tokens for custom apps as of January 1
// [2026]. Apps created via the current Dev Dashboard no longer show a
// static token anywhere in the UI at all — only a Client ID and Client
// Secret (the secret is in shpss_ format), which must be exchanged
// programmatically for a short-lived (~24hr) access token using the OAuth
// Client Credentials Grant, and refreshed before it expires.
//
// This app supports both:
// - SHOPIFY_ACCESS_TOKEN set directly: used as-is. Only actually available
//   if you have an older, admin-created custom app from before the change;
//   Shopify says these still work.
// - SHOPIFY_API_KEY (Client ID) + SHOPIFY_API_SECRET (Client Secret) set:
//   exchanged for a token automatically, cached in memory, and refreshed
//   proactively before it expires. This is the only option for any app
//   created in the Dev Dashboard now, i.e. almost everyone going forward.
let tokenCache = { token: null, expiresAt: 0 };

async function exchangeClientCredentials(domain, clientId, clientSecret) {
  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.access_token) {
    const errCode = data.error || "";
    const errDesc = data.error_description || JSON.stringify(data);
    if (/application_cannot_be_found/i.test(errCode) || /application_cannot_be_found/i.test(errDesc)) {
      throw new Error(
        `Shopify couldn't find an app matching this Client ID on ${domain}. Copy the Client ID fresh from the Dev Dashboard for the app installed on THIS store specifically (client credentials from a different app or a different store won't work).`
      );
    }
    if (/shop_not_permitted/i.test(errCode) || /shop_not_permitted/i.test(errDesc)) {
      throw new Error(
        `Shopify rejected the client credentials exchange for ${domain} (shop_not_permitted). This happens when the app and the store are in different organizations, e.g. an agency's app trying to authenticate against a client's store. The Client Credentials Grant only works within one organization, if that's the situation here, you'd need Token Exchange or the Authorization Code Grant instead, which are a bigger lift (they need a real OAuth install flow with a redirect URI), so flag this back and we can scope that properly rather than patching around it.`
      );
    }
    throw new Error(`Shopify rejected the client credentials exchange: ${errDesc}`);
  }

  return data; // { access_token, expires_in, ... }
}

async function getAccessToken(domain) {
  const staticToken = (process.env.SHOPIFY_ACCESS_TOKEN || "").trim();
  if (staticToken && staticToken !== "shpat_...") {
    return staticToken;
  }

  const clientId = (process.env.SHOPIFY_API_KEY || "").trim();
  const clientSecret = (process.env.SHOPIFY_API_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "No Shopify credentials found. Set either SHOPIFY_ACCESS_TOKEN (only if you have an older, admin-created custom app with a static shpat_ token) or SHOPIFY_API_KEY + SHOPIFY_API_SECRET (the Client ID and Client Secret from the Dev Dashboard — required for any app created there), then restart the server."
    );
  }

  const now = Date.now();
  // Refresh a minute early rather than exactly at expiry, so a token doesn't
  // go stale mid-request.
  if (tokenCache.token && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  const data = await exchangeClientCredentials(domain, clientId, clientSecret);
  tokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ? data.expires_in * 1000 : 20 * 60 * 60 * 1000), // ~20h fallback if Shopify omits expires_in
  };
  return tokenCache.token;
}

async function shopifyGraphQL(query, variables) {
  const domain = getDomain();
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2024-10";
  const token = await getAccessToken(domain);

  const res = await fetch(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    // A non-JSON body usually means the domain is wrong (Shopify's own 404
    // page), a firewall/proxy intercepted the request, or Shopify is down,
    // rather than anything about the credentials.
    throw new Error(`Shopify returned a non-JSON response (HTTP ${res.status}) from https://${domain}/admin/api/${apiVersion}/graphql.json. Double-check SHOPIFY_STORE_DOMAIN is exactly right and reachable, this isn't a credentials issue.`);
  }
  if (data.errors) {
    const errText = typeof data.errors === "string" ? data.errors : JSON.stringify(data.errors);
    if (/invalid api key or access token/i.test(errText) || res.status === 401) {
      // The token we had might have been revoked mid-life rather than
      // merely expired on schedule, force a fresh exchange next time
      // instead of serving the same bad cached token again.
      tokenCache = { token: null, expiresAt: 0 };
      const masked = token.length > 10 ? `${token.slice(0, 8)}...${token.slice(-4)}` : "(very short — likely not a real token)";
      throw new Error(
        `Shopify rejected this access token as invalid (loaded token: ${masked}, store: ${domain}). Check that: (1) SHOPIFY_STORE_DOMAIN is the exact *.myshopify.com domain (not a custom domain), (2) if using SHOPIFY_API_KEY/SECRET, they're the Client ID/Secret for the app actually installed on this store, (3) if using a static SHOPIFY_ACCESS_TOKEN, it hasn't been revoked, (4) the server was restarted after the .env edit. The cached token has been cleared, so the next attempt will fetch a fresh one.`
      );
    }
    throw new Error(`Shopify GraphQL error: ${errText}`);
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
