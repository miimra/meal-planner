"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const response = require("./response.js");

test("OpenRouter response validator accepts exactly the requested meals", () => {
  const result = response.validateResponse(JSON.stringify({ meals: [
    { meal: "breakfast", name: "Omelette", reason: "Quick and familiar.", existingDishId: null },
    { meal: "dinner", name: "Salmon", reason: "Matches fish night.", existingDishId: "dish123" },
  ] }), ["breakfast", "dinner"]);
  assert.equal(result[0].name, "Omelette");
  assert.equal(result[1].existingDishId, "dish123");
});

test("OpenRouter response validator rejects missing, duplicate, and malformed meals", () => {
  assert.throws(() => response.validateResponse({ meals: [] }, ["dinner"]), /invalid_ai_response/);
  assert.throws(() => response.validateResponse({ meals: [
    { meal: "dinner", name: "A", reason: "Fine", existingDishId: null },
    { meal: "dinner", name: "B", reason: "Fine", existingDishId: null },
  ] }, ["lunch", "dinner"]), /invalid_ai_response/);
  assert.throws(() => response.contentJson("not json"), /invalid_ai_response/);
});
