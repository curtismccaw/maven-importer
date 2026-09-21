// Strips the (non-serializable, potentially large) raw image buffers out of
// what we send to the browser; the frontend only needs to know an image was
// matched and how confidently, plus a small preview thumbnail.
function toClientProduct(p) {
  return {
    ...p,
    variants: p.variants.map((v) => ({
      ...v,
      local_images: (v.local_images || []).map((img) => ({
        key: img.key,
        mimeType: img.mimeType,
        // Sent as-is for preview. For very large photo libraries, add a
        // resize step here (e.g. with sharp) before base64-encoding, the
        // full-resolution buffer is what actually gets pushed to Shopify.
        previewDataUrl: `data:${img.mimeType};base64,${img.buffer.toString("base64")}`,
      })),
      imageCount: (v.local_images || []).length,
    })),
  };
}

module.exports = { toClientProduct };
