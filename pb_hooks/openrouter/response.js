"use strict";

const MEALS = ["breakfast", "lunch", "dinner"];
const DIFFICULTIES = ["easy", "medium", "hard"];

function contentJson(content) {
  if (typeof content !== "string") throw new Error("invalid_ai_response");
  let value = content.trim();
  if (value.slice(0, 3) === "```") {
    value = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(value);
  } catch (_) {
    throw new Error("invalid_ai_response");
  }
}

function validateMeal(item, expected, serving) {
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid_ai_response");
  if (item.meal !== expected) throw new Error("invalid_ai_response");
  if (typeof item.name !== "string" || !item.name.trim() || item.name.trim().length > 200) {
    throw new Error("invalid_ai_response");
  }
  if (typeof item.reason !== "string" || !item.reason.trim() || item.reason.trim().length > 500) {
    throw new Error("invalid_ai_response");
  }
  if (item.existingDishId !== null && typeof item.existingDishId !== "string") {
    throw new Error("invalid_ai_response");
  }
  if (DIFFICULTIES.indexOf(item.difficulty) === -1) throw new Error("invalid_ai_response");
  if (!Number.isInteger(item.prepMinutes) || item.prepMinutes < 0 || item.prepMinutes > 1440) {
    throw new Error("invalid_ai_response");
  }
  if (!Number.isInteger(item.cookMinutes) || item.cookMinutes < 0 || item.cookMinutes > 1440) {
    throw new Error("invalid_ai_response");
  }
  if (!Array.isArray(item.ingredients) || item.ingredients.length < 1 || item.ingredients.length > 15) {
    throw new Error("invalid_ai_response");
  }
  const ingredients = item.ingredients.map((ingredient) => {
    if (typeof ingredient !== "string" || !ingredient.trim() || ingredient.trim().length > 160) {
      throw new Error("invalid_ai_response");
    }
    return ingredient.trim();
  });
  if (expected !== "dinner" && (
    item.difficulty !== "easy"
    || item.prepMinutes + item.cookMinutes > 20
    || ingredients.length > 8
  )) throw new Error("invalid_ai_response");
  const includesBaby = !serving || serving.includesBaby !== false;
  if (includesBaby && (
    typeof item.babyServing !== "string"
    || !item.babyServing.trim()
    || item.babyServing.trim().length > 400
  )) throw new Error("invalid_ai_response");
  if (!includesBaby && item.babyServing !== null) throw new Error("invalid_ai_response");
  return {
    meal: expected,
    name: item.name.trim(),
    reason: item.reason.trim(),
    difficulty: item.difficulty,
    prepMinutes: item.prepMinutes,
    cookMinutes: item.cookMinutes,
    ingredients,
    babyServing: includesBaby ? item.babyServing.trim() : null,
    existingDishId: item.existingDishId ? item.existingDishId.trim() : null,
  };
}

function validateResponse(value, expectedMeals, servings) {
  const parsed = typeof value === "string" ? contentJson(value) : value;
  if (!parsed || !Array.isArray(parsed.meals) || parsed.meals.length !== expectedMeals.length) {
    throw new Error("invalid_ai_response");
  }
  const byMeal = {};
  for (const item of parsed.meals) {
    if (!item || MEALS.indexOf(item.meal) === -1 || byMeal[item.meal]) throw new Error("invalid_ai_response");
    byMeal[item.meal] = item;
  }
  return expectedMeals.map((meal) => validateMeal(byMeal[meal], meal, servings && servings[meal]));
}

module.exports = { contentJson, validateResponse };
