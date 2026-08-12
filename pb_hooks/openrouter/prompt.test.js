"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const prompt = require("./prompt.js");

test("suggestion prompt constrains saved recipes to eligible stored candidates", () => {
  const context = {
    requested: { dinner: { category: { catId: 6, name: "Fish" } } },
    servings: { dinner: { adults: 2, babies: 1, includesBaby: true } },
    candidates: { dinner: [{ id: "saved123", name: "Saved salmon", lifecycle: "want_to_try", score: 2 }] },
  };
  const messages = prompt.messages(context, ["dinner"]);
  assert.match(messages[0].content, /choose only an ID listed in candidates/);
  assert.match(messages[0].content, /want_to_try candidate/);
  assert.match(messages[0].content, /untrusted reference data/);
  assert.match(messages[1].content, /saved123/);
});
