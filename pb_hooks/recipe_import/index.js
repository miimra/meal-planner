"use strict";

const fetcher = require(`${typeof __hooks === "undefined" ? "." : __hooks + "/recipe_import"}/fetch.js`);
const instagram = require(`${typeof __hooks === "undefined" ? "." : __hooks + "/recipe_import"}/instagram.js`);
const page = require(`${typeof __hooks === "undefined" ? "." : __hooks + "/recipe_import"}/page.js`);
const sourceUrl = require(`${typeof __hooks === "undefined" ? "." : __hooks + "/recipe_import"}/url.js`);
const youtube = require(`${typeof __hooks === "undefined" ? "." : __hooks + "/recipe_import"}/youtube.js`);
const client = require(`${typeof __hooks === "undefined" ? "." : __hooks + "/recipe_import"}/client.js`);

function inspect(rawUrl, options) {
  const opts = options || {};
  const canonicalUrl = sourceUrl.canonicalize(rawUrl);
  const kind = sourceUrl.platform(canonicalUrl);
  if (kind === "youtube") {
    try {
      const video = youtube.fetchSource(canonicalUrl, { apiKey: opts.youtubeApiKey, apiBase: opts.youtubeApiBase, send: opts.youtubeSend });
      if (video.linkedUrls.length && opts.fetch) {
        try {
          const linked = fetcher.fetchPage(video.linkedUrls[0], opts.fetch);
          const recipePage = page.parsePage(linked.body, linked.url);
          video.recipe = recipePage.recipe;
          video.text = (video.text + "\n\nLinked recipe page:\n" + recipePage.text).slice(0, 50000);
          video.sourceMetadata.linkedRecipeUrl = recipePage.sourceUrl;
          if (!video.imageUrl) video.imageUrl = recipePage.imageUrl;
        } catch (_) { /* video metadata remains useful when its linked page fails */ }
      }
      return video;
    } catch (error) {
      if (String(error && error.message) !== "youtube_not_configured") throw error;
    }
  }
  const fetched = fetcher.fetchPage(canonicalUrl, opts.fetch);
  return kind === "instagram" ? instagram.parseSource(fetched.body, fetched.url) : page.parsePage(fetched.body, fetched.url);
}

function importRecipe(rawUrl, categories, options) {
  const source = inspect(rawUrl, options || {});
  if (source.recipe) {
    const normalized = require(`${typeof __hooks === "undefined" ? "." : __hooks + "/recipe_import"}/response.js`).normalizeRecipe(source.recipe, source);
    const allowed = (categories || []).find((item) => String(item).trim().toLowerCase() === String(normalized.category || "").trim().toLowerCase());
    if (normalized.ingredients.length && normalized.instructions.length && allowed) {
      normalized.category = String(allowed).trim();
      const missingFields = [];
      if (!normalized.servings) missingFields.push("servings");
      if (normalized.prepMinutes === null && normalized.cookMinutes === null && normalized.totalMinutes === null) missingFields.push("timing");
      return { source, recipe: normalized, confidence: 0.98, missingFields, model: "schema.org" };
    }
  }
  const extracted = client.extract(source, categories, options && options.openrouter);
  return { source, recipe: extracted.recipe, confidence: extracted.confidence, missingFields: extracted.missingFields, model: extracted.model };
}

module.exports = { importRecipe, inspect };
