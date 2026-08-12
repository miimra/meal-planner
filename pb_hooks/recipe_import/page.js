"use strict";

const sourceUrl = require(`${typeof __hooks === "undefined" ? "." : __hooks + "/recipe_import"}/url.js`);

function entities(value) {
  const named = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, code) => {
    const lower = code.toLowerCase();
    if (named[lower]) return named[lower];
    if (lower.charAt(0) !== "#") return " ";
    const number = lower.charAt(1) === "x" ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return Number.isFinite(number) ? String.fromCharCode(number) : " ";
  });
}

function cleanText(value, max) {
  const text = entities(String(value || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return text.slice(0, max || 50000);
}

function attribute(tag, name) {
  const match = new RegExp("\\b" + name + "\\s*=\\s*([\\\"'])([\\s\\S]*?)\\1", "i").exec(tag);
  return match ? entities(match[2]).trim() : "";
}

function meta(html, keys) {
  const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = (attribute(tag, "property") || attribute(tag, "name")).toLowerCase();
    if (keys.indexOf(key) !== -1) return attribute(tag, "content");
  }
  return "";
}

function title(html) {
  return meta(html, ["og:title", "twitter:title"]) || cleanText((/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1], 300);
}

function typeIncludes(value, wanted) {
  const types = Array.isArray(value) ? value : [value];
  return types.some((type) => String(type || "").toLowerCase().replace(/^https?:\/\/schema.org\//, "") === wanted);
}

function jsonLdNodes(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.reduce((all, item) => all.concat(jsonLdNodes(item)), []);
  let nodes = [value];
  if (Array.isArray(value["@graph"])) nodes = nodes.concat(value["@graph"]);
  return nodes;
}

function recipeJsonLd(html) {
  const scripts = String(html || "").match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const body = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const nodes = jsonLdNodes(JSON.parse(entities(body)));
      for (const node of nodes) if (typeIncludes(node["@type"], "recipe")) return node;
    } catch (_) { /* malformed publisher data; continue */ }
  }
  return null;
}

function safeLink(base, href) {
  try {
    const resolved = sourceUrl.resolve(base, entities(href));
    sourceUrl.assertSafe(resolved);
    return resolved;
  } catch (_) { return null; }
}

function links(html, base) {
  const values = [];
  const tags = String(html || "").match(/<a\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const value = safeLink(base, attribute(tag, "href"));
    if (value && values.indexOf(value) === -1 && values.length < 30) values.push(value);
  }
  return values;
}

function parsePage(html, url) {
  const sourceTitle = title(html) || null;
  const sourceDescription = meta(html, ["description", "og:description", "twitter:description"]) || null;
  return {
    sourceUrl: sourceUrl.canonicalize(url),
    sourcePlatform: sourceUrl.platform(url),
    sourceTitle,
    sourceDescription,
    imageUrl: safeLink(url, meta(html, ["og:image", "twitter:image"])) || null,
    text: cleanText(html, 50000),
    recipe: recipeJsonLd(html),
    linkedUrls: links(html, url),
  };
}

module.exports = { cleanText, entities, meta, parsePage, recipeJsonLd };
