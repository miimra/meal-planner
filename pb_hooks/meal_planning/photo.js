"use strict";

// ponytail: look a photo up on the internet instead of paying an image model to
// draw one. No API key, no new dependency, ~300ms instead of the image
// endpoint's 120s budget. Wikipedia knows named dishes; Openverse covers the
// invented ones. A miss just means the card has no photo.
function base(name, fallback) {
  return String($os.getenv(name) || fallback).replace(/\/+$/, "");
}

function get(url) {
  const result = $http.send({
    method: "GET",
    url,
    timeout: 10,
    headers: { "User-Agent": "household-meal-planner/1.0" },
  });
  if (result.statusCode < 200 || result.statusCode >= 300) return null;
  return result.json;
}

// Telegram fetches the URL itself, so the only thing that matters is that it is
// a plain https image it can download.
function usable(url) {
  const value = String(url || "");
  return value.indexOf("https://") === 0 && /\.(jpe?g|png)$/i.test(value.split("?")[0]);
}

function fromWikipedia(query) {
  const body = get(base("WIKIPEDIA_API_BASE_URL", "https://en.wikipedia.org") + "/w/api.php?action=query&format=json&formatversion=2"
    + "&generator=search&gsrlimit=5&prop=pageimages&piprop=thumbnail&pithumbsize=1000"
    + "&gsrsearch=" + encodeURIComponent(query + " food"));
  const pages = body && body.query && body.query.pages;
  for (const page of Array.isArray(pages) ? pages : []) {
    const source = page && page.thumbnail && page.thumbnail.source;
    if (usable(source)) return String(source);
  }
  return "";
}

function fromOpenverse(query) {
  const body = get(base("OPENVERSE_API_BASE_URL", "https://api.openverse.org") + "/v1/images/?page_size=5&q=" + encodeURIComponent(query));
  for (const item of (body && Array.isArray(body.results) ? body.results : [])) {
    // Openverse's own `thumbnail` is an extension-less proxy URL, so use the
    // direct file; the extension check keeps out anything Telegram can't fetch.
    if (item && usable(item.url)) return String(item.url);
  }
  return "";
}

function lookup(name) {
  const query = String(name || "").trim().slice(0, 100);
  if (!query) return "";
  return fromWikipedia(query) || fromOpenverse(query);
}

module.exports = { fromOpenverse, fromWikipedia, lookup, usable };
