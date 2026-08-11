"use strict";

const MEALS = ["breakfast", "lunch", "dinner"];

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

function validateMeal(item, expected) {
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
  return {
    meal: expected,
    name: item.name.trim(),
    reason: item.reason.trim(),
    existingDishId: item.existingDishId ? item.existingDishId.trim() : null,
  };
}

function validateResponse(value, expectedMeals) {
  const parsed = typeof value === "string" ? contentJson(value) : value;
  if (!parsed || !Array.isArray(parsed.meals) || parsed.meals.length !== expectedMeals.length) {
    throw new Error("invalid_ai_response");
  }
  const byMeal = {};
  for (const item of parsed.meals) {
    if (!item || MEALS.indexOf(item.meal) === -1 || byMeal[item.meal]) throw new Error("invalid_ai_response");
    byMeal[item.meal] = item;
  }
  return expectedMeals.map((meal) => validateMeal(byMeal[meal], meal));
}

module.exports = { contentJson, validateResponse };
