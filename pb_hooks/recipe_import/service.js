"use strict";

const importer = require(`${__hooks}/recipe_import/index.js`);
const json = require(`${__hooks}/shared/json.js`);
const runtime = require(`${__hooks}/recipe_import/runtime.js`);
const sourceUrl = require(`${__hooks}/recipe_import/url.js`);

function first(app, collection, filter, params) {
  const records = app.findRecordsByFilter(collection, filter, "", 1, 0, params || {});
  return records.length ? records[0] : null;
}

function categories(app) {
  return app.findRecordsByFilter("categories", "", "catId", 0, 0);
}

function categoryNames(items) {
  return items.map((item) => item.getString("name_en"));
}

function categoryForRecipe(items, recipe) {
  const wanted = String(recipe && recipe.category || "").trim().toLowerCase();
  if (!wanted) return null;
  return items.find((item) => item.getString("name_en").trim().toLowerCase() === wanted) || null;
}

function safeError(error) {
  return String(error && error.message || "recipe_import_failed").replace(/[^a-z0-9_]+/gi, "_").toLowerCase().slice(0, 120);
}

function needsInput(errorCode) {
  return [
    "youtube_not_configured", "youtube_video_unavailable", "instagram_recipe_unavailable",
    "invalid_recipe_extraction", "source_fetch_failed", "unsupported_source_type",
  ].indexOf(errorCode) !== -1;
}

function create(app, rawUrl, user, destination, responseMessageId) {
  const canonical = sourceUrl.canonicalize(rawUrl);
  const saved = first(app, "recipe_imports", "canonical_url = {:url} && status = 'saved' && dish != ''", { url: canonical });
  if (saved) return saved;
  const record = new Record(app.findCollectionByNameOrId("recipe_imports"));
  record.set("source_url", rawUrl);
  record.set("canonical_url", canonical);
  record.set("platform", sourceUrl.platform(canonical));
  record.set("status", "pending");
  record.set("requested_by", user.id);
  record.set("chat_id", destination.getString("chat_id"));
  record.set("response_message_id", String(responseMessageId || ""));
  record.set("error", "");
  app.save(record);
  return record;
}

function inspectOptions() {
  return {
    youtubeApiKey: String($os.getenv("YOUTUBE_API_KEY") || ""),
    youtubeApiBase: String($os.getenv("YOUTUBE_API_BASE_URL") || ""),
    fetch: { resolve: runtime.resolvePublic, transport: runtime.curlTransport, maxBytes: 2 * 1024 * 1024, timeout: 15, maxRedirects: 4 },
  };
}

function analyze(app, record) {
  if (["saved", "cancelled"].indexOf(record.getString("status")) !== -1) return record;
  record.set("status", "processing");
  record.set("error", "");
  app.save(record);
  try {
    const availableCategories = categories(app);
    const result = importer.importRecipe(record.getString("canonical_url"), categoryNames(availableCategories), inspectOptions());
    const recipe = result.recipe;
    const substantiveMissing = result.missingFields.filter((field) => ["name", "ingredients", "instructions"].indexOf(field) !== -1);
    record.set("source_title", result.source.sourceTitle || recipe.sourceTitle || "");
    record.set("source_description", String(result.source.sourceDescription || "").slice(0, 20000));
    record.set("source_metadata", result.source.sourceMetadata || {});
    record.set("extracted_recipe", recipe);
    record.set("confidence", result.confidence);
    record.set("missing_fields", result.missingFields);
    record.set("model", result.model || "");
    record.set("status", substantiveMissing.length || result.confidence < 0.45 ? "needs_input" : "ready");
    app.save(record);
  } catch (error) {
    const code = safeError(error);
    record.set("status", needsInput(code) ? "needs_input" : "failed");
    record.set("error", code);
    app.save(record);
  }
  return record;
}

function recipe(record) {
  const value = json.valueField(record, "extracted_recipe");
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function ensureMessage(record, destination, message) {
  if (!message || String(message.message_id) !== record.getString("response_message_id")) throw new Error("recipe_import_message_mismatch");
  if (record.getString("chat_id") !== destination.getString("chat_id")) throw new Error("recipe_import_chat_mismatch");
}

function setCategory(app, record, categoryId) {
  if (record.getString("status") !== "ready") throw new Error("recipe_import_not_ready");
  const category = app.findRecordById("categories", categoryId);
  const value = recipe(record);
  if (!value) throw new Error("recipe_import_not_ready");
  value.category = category.getString("name_en");
  record.set("extracted_recipe", value);
  const missing = json.arrayField(record, "missing_fields").filter((item) => item !== "category");
  record.set("missing_fields", missing);
  app.save(record);
  return record;
}

function save(app, record) {
  if (record.getString("status") === "saved" && record.getString("dish")) return app.findRecordById("dishes", record.getString("dish"));
  if (record.getString("status") !== "ready") throw new Error("recipe_import_not_ready");
  const extracted = recipe(record);
  if (!extracted || !extracted.name || !extracted.ingredients || !extracted.ingredients.length || !extracted.instructions || !extracted.instructions.length) {
    throw new Error("recipe_import_not_ready");
  }
  let dishId = "";
  app.runInTransaction((tx) => {
    const current = tx.findRecordById("recipe_imports", record.id);
    if (current.getString("status") === "saved" && current.getString("dish")) { dishId = current.getString("dish"); return; }
    if (current.getString("status") !== "ready") throw new Error("recipe_import_not_ready");
    let dish = first(tx, "dishes", "source_url = {:url}", { url: current.getString("canonical_url") });
    const isNewDish = !dish;
    if (!dish) dish = new Record(tx.findCollectionByNameOrId("dishes"));
    dish.set("name", extracted.name);
    if (isNewDish || dish.getString("lifecycle") !== "regular") dish.set("lifecycle", "want_to_try");
    dish.set("source_url", current.getString("canonical_url"));
    dish.set("source_platform", current.getString("platform"));
    dish.set("source_import", current.id);
    dish.set("ingredients", extracted.ingredients);
    dish.set("instructions", extracted.instructions);
    if (Number.isInteger(extracted.prepMinutes)) dish.set("prep_minutes", extracted.prepMinutes);
    if (Number.isInteger(extracted.cookMinutes)) dish.set("cook_minutes", extracted.cookMinutes);
    if (extracted.difficulty) dish.set("difficulty", extracted.difficulty);
    if (extracted.cuisine) dish.set("cuisine", extracted.cuisine);
    const tags = Array.isArray(extracted.tags) ? extracted.tags.slice() : [];
    for (const mealType of (Array.isArray(extracted.mealTypes) ? extracted.mealTypes : [])) {
      const marker = "meal:" + mealType;
      if (tags.indexOf(marker) === -1) tags.push(marker);
    }
    dish.set("tags", tags);
    const category = categoryForRecipe(categories(tx), extracted);
    if (!category) throw new Error("recipe_import_category_required");
    dish.set("catId", category.getInt("catId"));
    dish.set("categories", [category.id]);
    tx.save(dish);
    current.set("dish", dish.id);
    current.set("status", "saved");
    tx.save(current);
    dishId = dish.id;
  });
  return app.findRecordById("dishes", dishId);
}

function cancel(app, record) {
  if (record.getString("status") === "saved") return record;
  record.set("status", "cancelled");
  app.save(record);
  return record;
}

module.exports = { analyze, cancel, create, ensureMessage, recipe, save, setCategory };
