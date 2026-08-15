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

test("the scheduled check-in prioritizes tomorrow and offers direct planning", () => {
  const today = {
    date: "2026-08-15",
    meals: {
      breakfast: slot("breakfast", { dish: { name: "Eggs" }, status: "planned" }),
      lunch: slot("lunch", { status: "leftovers" }),
      dinner: slot("dinner", { status: "eating_out" }),
    },
  };
  const tomorrow = {
    date: "2026-08-16",
    meals: {
      breakfast: slot("breakfast"),
      lunch: slot("lunch"),
      dinner: slot("dinner", { categoryOptions: [
        { catId: 2, emoji: "🍢", name: "Iranian Grilled" },
        { catId: 3, emoji: "🍲", name: "Heavy Iranian Stews" },
      ] }),
    },
  };
  const text = views.dailyText(today, tomorrow);
  assert.ok(text.indexOf("Tomorrow · 2026-08-16") < text.indexOf("Today · 2026-08-15"));
  assert.match(text, /Choose: 🍢 Iranian Grilled or 🍲 Heavy Iranian Stews/);
  assert.match(text, /Left over/);
  assert.match(JSON.stringify(views.dailyKeyboard(today.date, tomorrow.date, true)), /Plan tomorrow/);
});
