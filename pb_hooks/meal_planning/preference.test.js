"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const preference = require("./preference.js");

const fish = { catId: 6, name: "Seafood", nameFa: "ماهی و غذاهای دریایی" };
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

test("every rotation category, pizza included, has its own food terms", () => {
  const pizza = { catId: 12, name: "Pizza", nameFa: "پیتزا" };
  assert.equal(preference.matchesDinnerCategory("veggie pizza", pizza, dishes), true);
  assert.equal(preference.matchesDinnerCategory("chicken tacos", pizza, dishes), false);
  const wraps = { catId: 8, name: "Wraps & Sandwiches", nameFa: "رپ و ساندویچ" };
  assert.equal(preference.matchesDinnerCategory("chicken tacos", wraps, dishes), true);
  const soup = { catId: 11, name: "Soup / Ash", nameFa: "سوپ و آش" };
  assert.equal(preference.matchesDinnerCategory("ash reshteh", soup, dishes), true);
});

test("excluded food terms are detected in generated details", () => {
  assert.equal(preference.outputContainsRequest({ name: "Shrimp", ingredients: ["chicken breast"] }, "quick chicken"), true);
  assert.equal(preference.outputContainsRequest({ name: "Shrimp", ingredients: ["broccoli"] }, "quick chicken"), false);
});
