"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const preference = require("./preference.js");

const fish = { catId: 6, name: "Fish & Shrimp", nameFa: "ماهی و میگو" };
const dishes = [{ name: "Lemon salmon", categoryId: 6 }];

test("dinner food preferences must match the main category", () => {
  assert.equal(preference.matchesDinnerCategory("sea food", fish, dishes), true);
  assert.equal(preference.matchesDinnerCategory("salmon", fish, dishes), true);
  assert.equal(preference.matchesDinnerCategory("chicken", fish, dishes), false);
});

test("effort and vegetable modifiers remain compatible with every category", () => {
  assert.equal(preference.matchesDinnerCategory("very easy", fish, dishes), true);
  assert.equal(preference.matchesDinnerCategory("more veggies", fish, dishes), true);
});

test("excluded food terms are detected in generated details", () => {
  assert.equal(preference.outputContainsRequest({ name: "Shrimp", ingredients: ["chicken breast"] }, "quick chicken"), true);
  assert.equal(preference.outputContainsRequest({ name: "Shrimp", ingredients: ["broccoli"] }, "quick chicken"), false);
});
