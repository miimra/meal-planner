"use strict";

const sourceUrl = require(`${typeof __hooks === "undefined" ? "." : __hooks + "/recipe_import"}/url.js`);

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 4;
const ALLOWED_TYPES = ["text/html", "application/xhtml+xml", "application/ld+json", "text/plain"];

function header(headers, name) {
  const wanted = String(name).toLowerCase();
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() !== wanted) continue;
    const value = headers[key];
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }
  return "";
}

function bodyLength(value) {
  if (Array.isArray(value) || value instanceof Uint8Array) return value.length;
  return String(value || "").length;
}

function decodeBody(result) {
  if (typeof result.raw === "string") return result.raw;
  if (typeof result.body === "string") return result.body;
  if (!result.body) return "";
  if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(result.body));
  let encoded = "";
  for (const byte of result.body) encoded += "%" + Number(byte).toString(16).padStart(2, "0");
  try { return decodeURIComponent(encoded); } catch (_) { return String.fromCharCode.apply(null, result.body); }
}

function validateResponse(result, maxBytes) {
  if (!result || typeof result.statusCode !== "number") throw new Error("source_fetch_failed");
  const contentLength = Number(header(result.headers, "content-length") || 0);
  if (contentLength > maxBytes || bodyLength(result.body || result.raw) > maxBytes) throw new Error("source_too_large");
  const type = header(result.headers, "content-type").split(";")[0].trim().toLowerCase();
  if (type && ALLOWED_TYPES.indexOf(type) === -1) throw new Error("unsupported_source_type");
  return type || "text/html";
}

function fetchPage(rawUrl, options) {
  const opts = options || {};
  const transport = opts.transport;
  const resolver = opts.resolve;
  if (typeof transport !== "function" || typeof resolver !== "function") {
    // PocketBase's $http.send follows redirects internally and exposes no redirect
    // policy. Requiring a no-follow transport keeps redirect validation enforceable.
    throw new Error("safe_fetch_dependencies_required");
  }
  const maxBytes = Number(opts.maxBytes || DEFAULT_MAX_BYTES);
  const maxRedirects = Number(opts.maxRedirects === undefined ? DEFAULT_MAX_REDIRECTS : opts.maxRedirects);
  let current = sourceUrl.canonicalize(rawUrl);
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const parsed = sourceUrl.parse(current);
    const addresses = resolver(parsed.hostname);
    sourceUrl.assertSafe(current, addresses);
    const result = transport({
      method: "GET",
      url: current,
      timeout: Number(opts.timeout || 15),
      maxBytes,
      followRedirects: false,
      resolvedAddresses: addresses,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/ld+json,text/plain;q=0.8",
        "User-Agent": "HouseholdMealPlanner/1.0 (+https://meal.number34.nl)",
      },
    });
    if (result.statusCode >= 300 && result.statusCode < 400) {
      if (redirects === maxRedirects) throw new Error("too_many_source_redirects");
      const location = header(result.headers, "location");
      if (!location) throw new Error("invalid_source_redirect");
      current = sourceUrl.resolve(current, location);
      continue;
    }
    if (result.statusCode < 200 || result.statusCode >= 300) throw new Error("source_fetch_failed");
    const contentType = validateResponse(result, maxBytes);
    return {
      url: current,
      statusCode: result.statusCode,
      contentType,
      body: decodeBody(result),
      headers: result.headers || {},
    };
  }
  throw new Error("too_many_source_redirects");
}

module.exports = { decodeBody, fetchPage, header, validateResponse };
