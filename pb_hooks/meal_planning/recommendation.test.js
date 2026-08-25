"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const recommendation = require("./recommendation.js");

const dishes = [
  { id: "saved", name: "Saved salmon tray", lifecycle: "want_to_try", categoryId: 6 },
  { id: "liked", name: "Lemon salmon", lifecycle: "regular", categoryId: 6 },
  { id: "wrong", name: "Chicken curry", lifecycle: "want_to_try", categoryId: 5 },
  { id: "archived", name: "Old tuna bake", lifecycle: "archived", categoryId: 6 },
];

test("saved untried recipes get a bounded exploration boost", () => {
  const ranked = recommendation.rankCandidates(dishes, { categoryId: 6, targetDate: "2026-08-20" });
  assert.deepEqual(ranked.map((item) => item.id), ["saved", "liked"]);
  assert.equal(ranked[0].score, 2);
  assert.deepEqual(ranked[0].signals, ["saved_untried"]);
});

test("category, archive, and current-week assignment are hard eligibility rules", () => {
  const ranked = recommendation.rankCandidates(dishes, {
    assignedDishIds: ["saved"],
    categoryId: 6,
    targetDate: "2026-08-20",
  });
  assert.deepEqual(ranked.map((item) => item.id), ["liked"]);
});

test("category choices may allow more than one dinner category", () => {
  const ranked = recommendation.rankCandidates(dishes, {
    categoryIds: [5, 6],
    targetDate: "2026-08-20",
  });
  assert.deepEqual(ranked.map((item) => item.id), ["wrong", "saved", "liked"]);
});

test("a dish is eligible through any related category", () => {
  const ranked = recommendation.rankCandidates([
    { id: "shrimp-pasta", name: "Shrimp pasta", lifecycle: "regular", categoryId: 6, categoryIds: [6, 7] },
    { id: "salmon", name: "Salmon", lifecycle: "regular", categoryId: 6, categoryIds: [6] },
  ], {
    categoryId: 7,
    targetDate: "2026-08-20",
  });
  assert.deepEqual(ranked.map((item) => item.id), ["shrimp-pasta"]);
});

test("a flexible dinner still excludes legacy uncategorized dishes", () => {
  const ranked = recommendation.rankCandidates([
    { id: "dinner", name: "Family dinner", lifecycle: "regular", categoryId: 5, categoryIds: [5] },
    { id: "breakfast", name: "Banana pancakes", lifecycle: "regular", categoryId: null, categoryIds: [] },
  ], {
    meal: "dinner",
    categoryIds: [],
    targetDate: "2026-08-20",
  });
  assert.deepEqual(ranked.map((item) => item.id), ["dinner"]);
});

test("feedback and recent cooking adjust candidate rank", () => {
  const ranked = recommendation.rankCandidates(dishes, {
    categoryId: 6,
    targetDate: "2026-08-20",
    feedback: [
      { dishId: "liked", rating: "liked", makeAgain: "yes" },
      { dishId: "saved", rating: "disliked", makeAgain: "no" },
    ],
    occurrences: [{ dishId: "liked", date: "2026-07-01" }],
  });
  assert.deepEqual(ranked.map((item) => item.id), ["liked", "saved"]);
  assert.equal(ranked[0].score, 2);
  assert.equal(ranked[1].score, -2);
});

test("stored dish IDs must be eligible and retain stored recipe details", () => {
  const candidates = { dinner: [{ id: "saved" }] };
  assert.equal(recommendation.isEligibleCandidate(candidates, "dinner", "saved"), true);
  assert.equal(recommendation.isEligibleCandidate(candidates, "dinner", "invented"), false);
  assert.equal(recommendation.isEligibleCandidate(candidates, "dinner", null), true);

  const item = recommendation.useStoredDishDetails([{
    id: "saved",
    name: "Saved salmon tray",
    difficulty: "easy",
    prepMinutes: 15,
    cookMinutes: 25,
    ingredients: ["500 g salmon", "2 courgettes"],
  }], {
    existingDishId: "saved",
    name: "Invented name",
    difficulty: "hard",
    prepMinutes: 90,
    cookMinutes: 90,
    ingredients: ["wrong"],
  });
  assert.deepEqual(item, {
    existingDishId: "saved",
    name: "Saved salmon tray",
    difficulty: "easy",
    prepMinutes: 15,
    cookMinutes: 25,
    ingredients: ["500 g salmon", "2 courgettes"],
  });
});

test("saved recipes respect extracted meal types and simple breakfast/lunch limits", () => {
  const candidates = [
    { id: "dinner", name: "Slow stew", lifecycle: "want_to_try", categoryId: 4, mealTypes: ["dinner"], difficulty: "easy", prepMinutes: 10, cookMinutes: 40, ingredients: ["beans"] },
    { id: "quick", name: "Quick toast", lifecycle: "want_to_try", categoryId: 4, mealTypes: ["breakfast"], difficulty: "easy", prepMinutes: 5, cookMinutes: 5, ingredients: ["bread"] },
  ];
  assert.deepEqual(recommendation.rankCandidates(candidates, { meal: "breakfast", targetDate: "2026-08-20" }).map((item) => item.id), ["quick"]);
  assert.deepEqual(recommendation.rankCandidates(candidates, { meal: "dinner", categoryId: 4, targetDate: "2026-08-20" }).map((item) => item.id), ["dinner"]);
});

test("names already suggested for this slot are dropped so 'Another' cannot repeat", () => {
  const ranked = recommendation.rankCandidates(dishes, {
    categoryId: 6,
    targetDate: "2026-08-20",
    excludeNames: ["  saved SALMON tray "],
  });
  assert.deepEqual(ranked.map((item) => item.id), ["liked"]);
});
