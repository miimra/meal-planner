"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const response = require("./response.js");

test("OpenRouter response validator accepts exactly the requested meals", () => {
  const result = response.validateResponse(JSON.stringify({ meals: [
    { meal: "breakfast", name: "Omelette", reason: "Quick and familiar.", difficulty: "easy", prepMinutes: 5, cookMinutes: 10, ingredients: ["4 eggs", "200 g spinach"], babyServing: "Cook fully and chop softly.", existingDishId: null },
    { meal: "dinner", name: "Salmon", reason: "Matches fish night.", difficulty: "medium", prepMinutes: 10, cookMinutes: 20, ingredients: ["500 g salmon", "1 lemon"], babyServing: "Flake carefully and check for bones.", existingDishId: "dish123" },
  ] }), ["breakfast", "dinner"]);
  assert.equal(result[0].name, "Omelette");
  assert.equal(result[1].existingDishId, "dish123");
  assert.equal(result[1].prepMinutes + result[1].cookMinutes, 30);
  assert.deepEqual(result[1].ingredients, ["500 g salmon", "1 lemon"]);
  assert.equal(result[1].babyServing, "Flake carefully and check for bones.");
});

test("OpenRouter response validator rejects missing, duplicate, and malformed meals", () => {
  assert.throws(() => response.validateResponse({ meals: [] }, ["dinner"]), /invalid_ai_response/);
  assert.throws(() => response.validateResponse({ meals: [
    { meal: "dinner", name: "A", reason: "Fine", difficulty: "easy", prepMinutes: 1, cookMinutes: 1, ingredients: ["A"], babyServing: "Serve soft.", existingDishId: null },
    { meal: "dinner", name: "B", reason: "Fine", difficulty: "easy", prepMinutes: 1, cookMinutes: 1, ingredients: ["B"], babyServing: "Serve soft.", existingDishId: null },
  ] }, ["lunch", "dinner"]), /invalid_ai_response/);
  assert.throws(() => response.validateResponse({ meals: [
    { meal: "dinner", name: "A", reason: "Fine", difficulty: "instant", prepMinutes: -1, cookMinutes: 1, ingredients: [], babyServing: "", existingDishId: null },
  ] }, ["dinner"]), /invalid_ai_response/);
  assert.throws(() => response.contentJson("not json"), /invalid_ai_response/);
});
