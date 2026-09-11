"use strict";

const MODIFIERS = [
  "easy", "very", "simple", "quick", "fast", "light", "healthy",
  "more", "extra", "vegetable", "vegetables", "veggie", "veggies",
  "low", "less", "salt", "salty", "sugar", "sugary", "baby", "safe",
];

const CATEGORY_TERMS = {
  1: ["egg", "eggs", "omelet", "omelette", "sausage", "potato", "bandari", "kuku", "falafel", "pan", "tomato", "eggplant"],
  2: ["grill", "grilled", "kebab", "kabob", "kabab", "chicken", "meat", "beef", "lamb", "joojeh", "koobideh"],
  3: ["stew", "khoresh", "khoresht", "meat", "beef", "lamb", "chicken", "fesenjan", "fesenjoon", "ghormeh", "gheymeh", "heavy"],
  4: ["rice", "polo", "pilaf", "dami", "tahchin", "chicken", "meat", "vegetable", "lentil", "bean"],
  5: ["chicken", "roast", "roasted", "tray bake", "vegetable", "vegetables", "potato", "rice", "curry", "teriyaki", "souvlaki", "butter chicken"],
  6: ["fish", "seafood", "sea food", "shrimp", "salmon", "tuna", "cod", "prawn"],
  7: ["pasta", "noodle", "noodles", "macaroni", "lasagna", "spaghetti", "penne"],
  8: ["wrap", "wraps", "sandwich", "burger", "hamburger", "taco", "shawarma", "tortilla", "pita"],
  9: ["oven", "baked", "bake", "casserole", "gratin", "pastry", "samosa", "cutlet", "kotlet", "piroski", "patty", "pie", "one dish", "one-dish"],
  10: ["salad", "cold", "plate", "bowl", "potato", "macaroni", "olivieh", "grain", "lentil", "tuna", "sushi"],
  11: ["soup", "ash", "aash", "lentil", "lentils", "barley", "abdoogh", "broth"],
  12: ["pizza", "calzone", "flatbread"],
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
