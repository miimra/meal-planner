"use strict";

const sourceUrl = require(`${typeof __hooks === "undefined" ? "." : __hooks + "/recipe_import"}/url.js`);

function linksInText(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s<>()]+/gi) || [];
  const result = [];
  for (const match of matches) {
    try {
      const value = sourceUrl.canonicalize(match.replace(/[),.;!]+$/, ""));
      if (sourceUrl.platform(value) === "web" && result.indexOf(value) === -1) result.push(value);
    } catch (_) { /* ignore malformed description links */ }
  }
  return result.slice(0, 10);
}

function parseVideoResponse(value, url) {
  const item = value && Array.isArray(value.items) ? value.items[0] : null;
  if (!item || !item.snippet) throw new Error("youtube_video_unavailable");
  const snippet = item.snippet;
  const thumbnails = snippet.thumbnails || {};
  const thumbnail = thumbnails.maxres || thumbnails.standard || thumbnails.high || thumbnails.medium || thumbnails.default;
  return {
    sourceUrl: sourceUrl.canonicalize(url),
    sourcePlatform: "youtube",
    sourceTitle: String(snippet.title || "").trim().slice(0, 300) || null,
    sourceDescription: String(snippet.description || "").trim().slice(0, 12000) || null,
    imageUrl: thumbnail && thumbnail.url ? String(thumbnail.url) : null,
    text: [snippet.title, snippet.description].filter(Boolean).join("\n\n").slice(0, 15000),
    recipe: null,
    linkedUrls: linksInText(snippet.description),
    sourceMetadata: { videoId: item.id, duration: item.contentDetails && item.contentDetails.duration || null },
  };
}

function fetchSource(url, options) {
  const opts = options || {};
  const id = sourceUrl.youtubeId(url);
  if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) throw new Error("invalid_youtube_url");
  const apiKey = String(opts.apiKey || (typeof $os !== "undefined" && $os.getenv("YOUTUBE_API_KEY")) || "").trim();
  if (!apiKey) throw new Error("youtube_not_configured");
  const send = opts.send || (typeof $http !== "undefined" && $http.send);
  if (typeof send !== "function") throw new Error("youtube_not_configured");
  const apiBase = String(opts.apiBase || (typeof $os !== "undefined" && $os.getenv("YOUTUBE_API_BASE_URL")) || "https://www.googleapis.com/youtube/v3").replace(/\/+$/, "");
  const result = send({
    method: "GET",
    url: apiBase + "/videos?part=snippet,contentDetails&id=" + encodeURIComponent(id) + "&key=" + encodeURIComponent(apiKey),
    timeout: 15,
    headers: { Accept: "application/json" },
  });
  if (!result || result.statusCode < 200 || result.statusCode >= 300) throw new Error("youtube_request_failed");
  return parseVideoResponse(result.json, url);
}

module.exports = { fetchSource, linksInText, parseVideoResponse };
