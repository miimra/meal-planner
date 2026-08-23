"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const page = require("./page.js");
const response = require("./response.js");
const youtube = require("./youtube.js");
const recipeImport = require("./index.js");

const html = `<!doctype html><html><head>
  <title>Ignored title</title><meta property="og:title" content="Bean &amp; Tomato Stew">
  <meta name="description" content="A quick family dinner."><meta property="og:image" content="/stew.jpg">
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":["Recipe"],"name":"Bean Stew","recipeIngredient":["2 cans beans","400 g tomatoes"],"recipeInstructions":[{"@type":"HowToStep","text":"Simmer together."}],"prepTime":"PT10M","cookTime":"PT25M","recipeYield":"4 servings","recipeCuisine":"Mediterranean","recipeCategory":"Stew"}]}</script>
</head><body><a href="/print">Print recipe</a><p>Serve warm.</p></body></html>`;

test("extracts Recipe JSON-LD, metadata, readable text, and safe links", () => {
  const source = page.parsePage(html, "https://recipes.example.org/stew");
  assert.equal(source.sourceTitle, "Bean & Tomato Stew");
  assert.equal(source.imageUrl, "https://recipes.example.org/stew.jpg");
  assert.equal(source.recipe.name, "Bean Stew");
  assert.deepEqual(source.linkedUrls, ["https://recipes.example.org/print"]);
  const recipe = response.normalizeRecipe(source.recipe, source);
  assert.equal(recipe.prepMinutes, 10);
  assert.equal(recipe.cookMinutes, 25);
  assert.equal(recipe.servings, 4);
  assert.deepEqual(recipe.instructions, ["Simmer together."]);
});

test("YouTube adapter extracts linked public recipe pages from description", () => {
  const source = youtube.parseVideoResponse({ items: [{ id: "abc123xyz", snippet: {
    title: "Best noodles", description: "Recipe: https://food.example.com/noodles?utm_source=youtube\nChannel https://youtube.com/x",
    thumbnails: { high: { url: "https://img.youtube.com/x.jpg" } },
  }, contentDetails: { duration: "PT8M" } }] }, "https://youtu.be/abc123xyz");
  assert.equal(source.sourcePlatform, "youtube");
  assert.deepEqual(source.linkedUrls, ["https://food.example.com/noodles"]);
  assert.equal(source.sourceMetadata.duration, "PT8M");
});

test("YouTube inspection enriches official metadata from a linked recipe page", () => {
  const source = recipeImport.inspect("https://youtu.be/abc123xyz", {
    youtubeApiKey: "key",
    youtubeSend: () => ({ statusCode: 200, json: { items: [{ id: "abc123xyz", snippet: {
      title: "Bean stew video", description: "Full recipe https://recipes.example.org/stew", thumbnails: {},
    }, contentDetails: { duration: "PT8M" } }] } }),
    fetch: {
      resolve: () => ["93.184.216.34"],
      transport: () => ({ statusCode: 200, headers: { "content-type": ["text/html"] }, raw: html }),
    },
  });
  assert.equal(source.sourceUrl, "https://www.youtube.com/watch?v=abc123xyz");
  assert.equal(source.recipe.name, "Bean Stew");
  assert.equal(source.sourceMetadata.linkedRecipeUrl, "https://recipes.example.org/stew");
});

test("strict extraction marks missing substantive recipe fields", () => {
  const source = { sourceUrl: "https://example.org/x", sourcePlatform: "web", sourceTitle: "Soup" };
  assert.throws(() => response.validateExtraction({ recipe: { name: "Soup", ingredients: [], instructions: [] }, confidence: 0.4, missingFields: [] }, source), /invalid_recipe_extraction/);
  const result = response.validateExtraction({ recipe: { name: "Soup", ingredients: [], instructions: [] }, confidence: 0.4, missingFields: ["ingredients", "instructions"] }, source);
  assert.equal(result.recipe.name, "Soup");
});

test("complete structured recipes import without an AI request", () => {
  const result = recipeImport.importRecipe("https://recipes.example.org/stew", ["Stew"], {
    fetch: {
      resolve: () => ["93.184.216.34"],
      transport: () => ({ statusCode: 200, headers: { "content-type": ["text/html"] }, raw: html }),
    },
    openrouter: { send: () => { throw new Error("AI must not be called"); } },
  });
  assert.equal(result.model, "schema.org");
  assert.equal(result.recipe.category, "Stew");
});
