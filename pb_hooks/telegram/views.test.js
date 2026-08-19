"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

global.__hooks = path.resolve(__dirname, "..");
const views = require("./views.js");

function slot(meal, overrides) {
  return Object.assign({ meal, status: "unplanned", dish: null, category: null, categoryOptions: [] }, overrides || {});
}

test("meal change views show the existing choice, dinner category, and neutral leftovers action", () => {
  const dinner = slot("dinner", {
    status: "planned",
    dish: { name: "Lemon salmon" },
    category: { catId: 6, emoji: "🐟", name: "Fish & Shrimp" },
    categoryOptions: [{ catId: 6, emoji: "🐟", name: "Fish & Shrimp" }],
  });
  assert.match(views.actionText("2026-08-12", "dinner", dinner), /Current: <b>Lemon salmon<\/b>/);
  assert.match(views.actionText("2026-08-12", "dinner", dinner), /Category: <b>🐟 Fish &amp; Shrimp<\/b>/);
  const keyboard = views.actionKeyboard("2026-08-12", "dinner", dinner);
  assert.match(JSON.stringify(keyboard), /Leftovers/);
  assert.doesNotMatch(JSON.stringify(keyboard), /Last meal/);
  assert.match(views.slotLine(slot("lunch", { status: "leftovers" })), /Left over/);
});

test("Sunday category choices are explicit and block suggestions until one is selected", () => {
  const options = [
    { catId: 2, emoji: "🍢", name: "Iranian Grilled" },
    { catId: 3, emoji: "🍲", name: "Heavy Iranian Stews" },
  ];
  const unselected = slot("dinner", { categoryOptions: options });
  assert.match(views.actionText("2026-08-16", "dinner", unselected), /choose 🍢 Iranian Grilled or 🍲 Heavy Iranian Stews/);
  assert.doesNotMatch(JSON.stringify(views.actionKeyboard("2026-08-16", "dinner", unselected)), /do:suggest/);

  const selected = Object.assign({}, unselected, { category: options[0] });
  assert.match(JSON.stringify(views.actionKeyboard("2026-08-16", "dinner", selected)), /do:suggest/);
});

function week(start, dinners) {
  return {
    start,
    end: "2026-08-23",
    days: dinners.map((overrides, index) => ({
      date: "2026-08-" + String(17 + index),
      meals: { dinner: slot("dinner", overrides) },
    })),
  };
}

test("the weekly plan lists every dinner and offers only the open days", () => {
  const value = week("2026-08-17", [
    { dish: { name: "Lemon salmon" }, status: "planned" },
    {},
    { status: "leftovers" },
    {},
    { status: "eating_out" },
    {},
    { categoryOptions: [
      { catId: 2, emoji: "🍢", name: "Iranian Grilled" },
      { catId: 3, emoji: "🍲", name: "Heavy Iranian Stews" },
    ] },
  ]);
  const text = views.weeklyPlanText(value, "Dinners for the week");
  assert.match(text, /2026-08-17 → 2026-08-23/);
  assert.match(text, /✅ <b>Mon<\/b> Lemon salmon/);
  assert.match(text, /⬜ <b>Tue<\/b>/);
  assert.match(text, /✅ <b>Wed<\/b>/);
  assert.match(text, /🍢 Iranian Grilled or 🍲 Heavy Iranian Stews/);
  assert.match(text, /<b>4 dinners still open\.<\/b>/);

  const keyboard = views.weeklyPlanKeyboard(value);
  const buttons = JSON.stringify(keyboard);
  assert.match(buttons, /"pick:meal:2026-08-18:dinner"/);
  assert.match(buttons, /"pick:meal:2026-08-23:dinner"/);
  // Days that are already settled never come back as a button.
  assert.doesNotMatch(buttons, /"pick:meal:2026-08-17:dinner"/);
  assert.doesNotMatch(buttons, /"pick:meal:2026-08-19:dinner"/);
  assert.doesNotMatch(buttons, /"pick:meal:2026-08-21:dinner"/);
});

test("a fully planned week says so and asks for nothing", () => {
  const value = week("2026-08-17", [
    { dish: { name: "A" }, status: "planned" },
    { dish: { name: "B" }, status: "planned" },
    { dish: { name: "C" }, status: "cooked" },
    { status: "skipped" },
    { status: "buy_food" },
    { status: "eating_out" },
    { dish: { name: "G" }, status: "planned" },
  ]);
  assert.equal(views.openDinners(value).length, 0);
  assert.match(views.weeklyPlanText(value, "Dinners for the week"), /Every dinner is planned/);
  assert.doesNotMatch(JSON.stringify(views.weeklyPlanKeyboard(value)), /pick:meal/);
});

test("the nudge names the open days and nothing else", () => {
  const value = week("2026-08-17", [
    { dish: { name: "A" }, status: "planned" },
    {},
    { dish: { name: "C" }, status: "planned" },
    {},
    { dish: { name: "E" }, status: "planned" },
    { dish: { name: "F" }, status: "planned" },
    { dish: { name: "G" }, status: "planned" },
  ]);
  const text = views.nudgeText(value);
  assert.match(text, /2 dinners still open/);
  assert.match(text, /Tue, Thu/);
  assert.doesNotMatch(text, /Lemon|Mon|Wed/);
});

test("the menu offers a way back into the weekly plan", () => {
  assert.match(JSON.stringify(views.mealsKeyboard("2026-08-19", "2026-08-20")), /"nav:planweek"/);
});

test("an own-dish reply round trip carries its own date and meal", () => {
  const prompt = views.ownDishText("2026-08-16", "dinner");
  assert.deepEqual(views.parseOwnDishText(prompt), { date: "2026-08-16", meal: "dinner" });
  assert.equal(views.parseOwnDishText("What are you cooking for tomorrow?"), null);
  assert.equal(views.parseOwnDishText(""), null);
  assert.match(views.ownDishSavedText("2026-08-16", "dinner", "Ghormeh <sabzi>"), /Ghormeh &lt;sabzi&gt;/);
  assert.match(JSON.stringify(views.actionKeyboard("2026-08-16", "dinner", slot("dinner"))), /do:own:2026-08-16:dinner/);
});
