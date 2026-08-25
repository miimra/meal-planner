"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const prompt = require("./prompt.js");

test("suggestion prompt constrains saved recipes to eligible stored candidates", () => {
  const context = {
    requested: { dinner: { category: { catId: 6, name: "Seafood", effort: "medium", effortMinutes: { min: 20, max: 50 }, notes: "Fish must be central." } } },
    servings: { dinner: { adults: 2, babies: 1, includesBaby: true } },
    candidates: { dinner: [{ id: "saved123", name: "Saved salmon", lifecycle: "want_to_try", score: 2, difficulty: "easy", prepMinutes: 10, cookMinutes: 25, cuisine: "Mediterranean", tags: ["fish"], ingredients: ["salmon", "courgette"] }] },
  };
  const messages = prompt.messages(context, ["dinner"]);
  assert.match(messages[0].content, /choose only an ID listed in candidates/);
  assert.match(messages[0].content, /want_to_try candidate/);
  assert.match(messages[0].content, /untrusted reference data/);
  assert.match(messages[1].content, /saved123/);
  assert.match(messages[1].content, /Fish must be central/);
  assert.match(messages[1].content, /Mediterranean/);
  assert.match(messages[1].content, /courgette/);
});

test("the request payload carries the shortlist, not the whole library", () => {
  const context = {
    targetDate: "2026-08-20",
    requested: { dinner: { category: { catId: 6, name: "Seafood" } } },
    servings: { dinner: { adults: 2, babies: 1, includesBaby: true } },
    candidates: { dinner: Array.from({ length: 40 }, (_, index) => ({ id: "d" + index, name: "Dish " + index, score: -index })) },
    avoid: { dinner: ["Lemon salmon"] },
    week: { days: [{ meals: { dinner: { dish: { name: "Baked cod" } } } }, { meals: { dinner: { dish: { name: "Baked cod" } } } }] },
    // Deliberately large fields that must not reach the model.
    dishes: [{ id: "d0", name: "Dish 0", instructions: ["step"], notes: "x" }],
    feedback: [{ dishId: "d0", rating: "liked" }],
  };
  const body = prompt.payload(context, ["dinner"], {}, {});
  assert.equal(body.candidates.dinner.length, 20);
  assert.deepEqual(body.plannedThisWeek, ["Baked cod"]);
  assert.deepEqual(body.doNotSuggest.dinner, ["Lemon salmon"]);
  assert.equal(body.dishes, undefined);
  assert.equal(body.feedback, undefined);
  assert.equal(body.week, undefined);
  assert.doesNotMatch(JSON.stringify(body), /instructions/);
});

test("the prompt forbids repeating a recently offered dish", () => {
  const messages = prompt.messages({ candidates: {}, avoid: {} }, ["dinner"]);
  assert.match(messages[0].content, /doNotSuggest/);
});
