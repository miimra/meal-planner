"use strict";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const MISSING_FIELDS = ["name", "ingredients", "instructions", "servings", "timing", "category"];

function contentJson(content) {
  if (typeof content !== "string") throw new Error("invalid_recipe_extraction");
  let value = content.trim();
  if (value.slice(0, 3) === "```") value = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(value); } catch (_) { throw new Error("invalid_recipe_extraction"); }
}

function string(value, max, nullable) {
  if (value === undefined || value === null || String(value).trim() === "") return nullable ? null : "";
  const result = String(value).replace(/\s+/g, " ").trim();
  if (result.length > max) throw new Error("invalid_recipe_extraction");
  return result;
}

function stringArray(value, maxItems, maxLength) {
  if (value === undefined || value === null) return [];
  const values = Array.isArray(value) ? value : [value];
  if (values.length > maxItems) throw new Error("invalid_recipe_extraction");
  const result = [];
  for (const item of values) {
    let candidate = item;
    if (item && typeof item === "object") candidate = item.text || item.name || item.description;
    const clean = string(candidate, maxLength, true);
    if (clean && result.indexOf(clean) === -1) result.push(clean);
  }
  return result;
}

function instructions(value) {
  if (!value) return [];
  const result = [];
  function visit(item) {
    if (result.length >= 40 || item === undefined || item === null) return;
    if (Array.isArray(item)) { for (const nested of item) visit(nested); return; }
    if (typeof item === "object") {
      if (item.itemListElement) visit(item.itemListElement);
      else visit(item.text || item.name);
      return;
    }
    const clean = string(item, 1200, true);
    if (clean) result.push(clean);
  }
  visit(value);
  return result;
}

function minutes(value) {
  if (value === null || value === undefined || value === "") return null;
  if (Number.isInteger(value)) return value >= 0 && value <= 2880 ? value : null;
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return minutes(Number(text));
  const iso = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i.exec(text);
  if (!iso) return null;
  const total = Number(iso[1] || 0) * 1440 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0);
  return total <= 2880 ? total : null;
}

function servings(value) {
  if (Number.isInteger(value) && value > 0 && value <= 100) return value;
  const match = /\d+/.exec(String(value || ""));
  const number = match ? Number(match[0]) : 0;
  return number > 0 && number <= 100 ? number : null;
}

function image(value) {
  let candidate = value;
  if (Array.isArray(candidate)) candidate = candidate[0];
  if (candidate && typeof candidate === "object") candidate = candidate.url || candidate.contentUrl;
  candidate = string(candidate, 2048, true);
  return candidate && /^https?:\/\//i.test(candidate) ? candidate : null;
}

function normalizeRecipe(value, source) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_recipe_extraction");
  const context = source || {};
  const name = string(value.name || value.headline || context.sourceTitle, 200, true);
  if (!name) throw new Error("invalid_recipe_extraction");
  const prepMinutes = minutes(value.prepMinutes !== undefined ? value.prepMinutes : value.prepTime);
  const cookMinutes = minutes(value.cookMinutes !== undefined ? value.cookMinutes : value.cookTime);
  const totalMinutes = minutes(value.totalMinutes !== undefined ? value.totalMinutes : value.totalTime);
  let difficulty = string(value.difficulty, 20, true);
  if (difficulty) difficulty = difficulty.toLowerCase();
  if (difficulty && DIFFICULTIES.indexOf(difficulty) === -1) throw new Error("invalid_recipe_extraction");
  const mealTypes = stringArray(value.mealTypes || value.mealType, 4, 20).map((item) => item.toLowerCase()).filter((item) => MEAL_TYPES.indexOf(item) !== -1);
  return {
    name,
    description: string(value.description, 1500, true),
    ingredients: stringArray(value.ingredients || value.recipeIngredient, 50, 300),
    instructions: instructions(value.instructions || value.recipeInstructions),
    prepMinutes,
    cookMinutes,
    totalMinutes,
    servings: servings(value.servings !== undefined ? value.servings : value.recipeYield),
    difficulty: difficulty || null,
    cuisine: string(value.cuisine || value.recipeCuisine, 100, true),
    mealTypes,
    category: string(value.category || value.recipeCategory, 100, true),
    tags: stringArray(value.tags || (typeof value.keywords === "string" ? value.keywords.split(",") : value.keywords), 20, 80),
    babyServing: string(value.babyServing, 500, true),
    imageUrl: image(value.imageUrl || value.image || context.imageUrl),
    sourceUrl: string(context.sourceUrl || value.sourceUrl, 2048, false),
    sourcePlatform: ["web", "youtube", "instagram"].indexOf(context.sourcePlatform || value.sourcePlatform) !== -1 ? context.sourcePlatform || value.sourcePlatform : "web",
    sourceTitle: string(context.sourceTitle || value.sourceTitle, 300, true),
  };
}

function validateExtraction(value, source) {
  const parsed = typeof value === "string" ? contentJson(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_recipe_extraction");
  const recipe = normalizeRecipe(parsed.recipe, source);
  if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) throw new Error("invalid_recipe_extraction");
  const missingFields = stringArray(parsed.missingFields, MISSING_FIELDS.length, 30);
  if (missingFields.some((field) => MISSING_FIELDS.indexOf(field) === -1)) throw new Error("invalid_recipe_extraction");
  if (!recipe.ingredients.length && missingFields.indexOf("ingredients") === -1) throw new Error("invalid_recipe_extraction");
  if (!recipe.instructions.length && missingFields.indexOf("instructions") === -1) throw new Error("invalid_recipe_extraction");
  return { recipe, confidence: parsed.confidence, missingFields };
}

module.exports = { contentJson, minutes, normalizeRecipe, validateExtraction };
