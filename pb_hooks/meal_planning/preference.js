"use strict";

const MODIFIERS = [
  "easy", "very", "simple", "quick", "fast", "light", "healthy",
  "more", "extra", "vegetable", "vegetables", "veggie", "veggies",
  "low", "less", "salt", "salty", "sugar", "sugary", "baby", "safe",
];

const CATEGORY_TERMS = {
  1: ["egg", "eggs", "omelet", "omelette", "sausage", "potato", "bandari"],
  2: ["grill", "grilled", "kebab", "kabob", "chicken", "meat", "beef", "lamb", "joojeh"],
  3: ["stew", "khoresh", "meat", "beef", "lamb", "chicken", "fesenjan", "heavy"],
  4: ["rice", "polo", "pilaf", "dami", "tahchin", "chicken", "meat", "vegetable"],
  5: ["chicken", "meat", "beef", "lamb", "curry", "teriyaki", "stroganoff"],
  6: ["fish", "seafood", "sea food", "shrimp", "salmon", "tuna", "cod", "prawn"],
  7: ["pasta", "noodle", "noodles", "macaroni", "lasagna", "spaghetti"],
  8: ["burger", "hamburger", "sushi"],
  9: ["pastry", "baked", "samosa", "cutlet", "kotlet", "piroski"],
  10: ["salad", "potato", "macaroni", "olivieh"],
  11: ["cold", "lentil", "lentils", "abdoogh", "soup"],
  12: ["pizza"],
};

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function words(value) {
  return normalized(value).split(/[\s,;/_-]+/).filter((item) => Boolean(item));
}

function foodTerms(value) {
  return words(value).filter((word) => MODIFIERS.indexOf(word) === -1 && word.length > 2);
}

function matchesDinnerCategory(value, category, dishes) {
  const request = normalized(value);
  if (!request || !foodTerms(request).length) return true;
  const terms = CATEGORY_TERMS[Number(category && category.catId)] || [];
  if (terms.some((term) => request.indexOf(term) !== -1)) return true;
  const names = [category && category.name, category && category.nameFa];
  for (const dish of dishes || []) {
    if (Number(dish.categoryId) === Number(category && category.catId)) names.push(dish.name);
  }
  return names.filter((name) => Boolean(name)).some((name) => {
    const candidate = normalized(name);
    return candidate.indexOf(request) !== -1 || request.indexOf(candidate) !== -1;
  });
}

function outputContainsRequest(item, request) {
  const content = normalized([
    item.name,
    item.reason,
    item.babyServing,
    (item.ingredients || []).join(" "),
  ].join(" "));
  return foodTerms(request).some((term) => content.indexOf(term) !== -1);
}

module.exports = { foodTerms, matchesDinnerCategory, outputContainsRequest };
