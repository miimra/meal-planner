"use strict";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const ALLOWED_MEDIA = ["image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

function decodeBase64(value) {
  const input = String(value || "").replace(/\s+/g, "");
  if (!input || input.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(input)) throw new Error("invalid_image_response");
  const bytes = [];
  for (let offset = 0; offset < input.length; offset += 4) {
    const a = BASE64.indexOf(input.charAt(offset));
    const b = BASE64.indexOf(input.charAt(offset + 1));
    const cChar = input.charAt(offset + 2);
    const dChar = input.charAt(offset + 3);
    const c = cChar === "=" ? 0 : BASE64.indexOf(cChar);
    const d = dChar === "=" ? 0 : BASE64.indexOf(dChar);
    if (a < 0 || b < 0 || c < 0 || d < 0 || (cChar === "=" && dChar !== "=")) throw new Error("invalid_image_response");
    const combined = (a << 18) | (b << 12) | (c << 6) | d;
    bytes.push((combined >> 16) & 255);
    if (cChar !== "=") bytes.push((combined >> 8) & 255);
    if (dChar !== "=") bytes.push(combined & 255);
    if (bytes.length > MAX_BYTES) throw new Error("invalid_image_response");
  }
  return bytes;
}

function hasSignature(bytes, mediaType) {
  if (mediaType === "image/jpeg") return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  return bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

function validateImageResponse(payload) {
  const item = payload && Array.isArray(payload.data) && payload.data.length === 1 ? payload.data[0] : null;
  const mediaType = item && String(item.media_type || "").toLowerCase();
  if (!item || ALLOWED_MEDIA.indexOf(mediaType) === -1 || typeof item.b64_json !== "string") {
    throw new Error("invalid_image_response");
  }
  const bytes = decodeBase64(item.b64_json);
  if (!hasSignature(bytes, mediaType)) throw new Error("invalid_image_response");
  return { bytes, mediaType, extension: mediaType === "image/webp" ? "webp" : "jpg" };
}

function config() {
  const apiKey = String($os.getenv("OPENROUTER_API_KEY") || "").trim();
  const model = String($os.getenv("OPENROUTER_IMAGE_MODEL") || "openai/gpt-5-image-mini").trim();
  if (!apiKey || !model) throw new Error("openrouter_image_not_configured");
  return {
    apiKey,
    model,
    baseUrl: String($os.getenv("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
    siteUrl: String($os.getenv("PUBLIC_BASE_URL") || "https://meal.number34.nl"),
  };
}

function generate(name, ingredients) {
  const cfg = config();
  const result = $http.send({
    method: "POST",
    url: cfg.baseUrl + "/images",
    timeout: 120,
    headers: {
      Authorization: "Bearer " + cfg.apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer": cfg.siteUrl,
      "X-Title": "Household Assistant Food Photos",
    },
    body: JSON.stringify({
      model: cfg.model,
      prompt: [
        "Realistic overhead editorial food photograph of " + String(name || "a family meal") + ".",
        "Show a freshly served, appetizing household meal using these cues: " + (ingredients || []).slice(0, 8).join(", ") + ".",
        "Natural window light, square composition, authentic textures, no people, no packaging, no writing, no letters, no logos, no watermark, no text.",
      ].join(" "),
      n: 1,
      aspect_ratio: "1:1",
      output_format: "jpeg",
      quality: "medium",
    }),
  });
  if (result.statusCode < 200 || result.statusCode >= 300) throw new Error("openrouter_image_request_failed");
  const image = validateImageResponse(result.json);
  image.model = cfg.model;
  return image;
}

module.exports = { decodeBase64, generate, validateImageResponse };
