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
  const keyboard = JSON.stringify(views.dailyKeyboard(today.date, tomorrow, true));
  assert.match(keyboard, /"pick:meal:2026-08-16:dinner"/);
  assert.match(keyboard, /"pick:meal:2026-08-16:breakfast"/);
  assert.match(keyboard, /"pick:meal:2026-08-16:lunch"/);
  assert.doesNotMatch(keyboard, /pick:date/);
});

test("the check-in ticks meals that are already decided", () => {
  const day = {
    date: "2026-08-16",
    meals: {
      breakfast: slot("breakfast", { dish: { name: "Eggs" }, status: "planned" }),
      lunch: slot("lunch", { status: "eating_out" }),
      dinner: slot("dinner", { category: { catId: 6, emoji: "🐟", name: "Fish & Shrimp" } }),
    },
  };
  const keyboard = views.dailyKeyboard("2026-08-15", day, false);
  assert.match(keyboard.inline_keyboard[1][0].text, /^✅ ☀️ Breakfast$/);
  assert.match(keyboard.inline_keyboard[1][1].text, /^✅ 🥪 Lunch$/);
  assert.match(keyboard.inline_keyboard[0][0].text, /^🌙 Dinner · Fish & Shrimp$/);
});

test("an own-dish reply round trip carries its own date and meal", () => {
  const prompt = views.ownDishText("2026-08-16", "dinner");
  assert.deepEqual(views.parseOwnDishText(prompt), { date: "2026-08-16", meal: "dinner" });
  assert.equal(views.parseOwnDishText("What are you cooking for tomorrow?"), null);
  assert.equal(views.parseOwnDishText(""), null);
  assert.match(views.ownDishSavedText("2026-08-16", "dinner", "Ghormeh <sabzi>"), /Ghormeh &lt;sabzi&gt;/);
  assert.match(JSON.stringify(views.actionKeyboard("2026-08-16", "dinner", slot("dinner"))), /do:own:2026-08-16:dinner/);
});
