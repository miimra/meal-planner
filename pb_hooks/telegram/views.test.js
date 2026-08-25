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
    category: { catId: 6, emoji: "🐟", name: "Seafood" },
    categoryOptions: [{ catId: 6, emoji: "🐟", name: "Seafood" }],
  });
  assert.match(views.actionText("2026-08-12", "dinner", dinner), /Current: <b>Lemon salmon<\/b>/);
  assert.match(views.actionText("2026-08-12", "dinner", dinner), /Category: <b>🐟 Seafood<\/b>/);
  const keyboard = views.actionKeyboard("2026-08-12", "dinner", dinner);
  assert.match(JSON.stringify(keyboard), /Leftovers/);
  assert.doesNotMatch(JSON.stringify(keyboard), /Last meal/);
  assert.match(views.slotLine(slot("lunch", { status: "leftovers" })), /Left over/);
});

test("Sunday category choices are explicit and block suggestions until one is selected", () => {
  const options = [
    { catId: 2, emoji: "🍢", name: "Iranian Grills" },
    { catId: 3, emoji: "🍲", name: "Iranian Stews & Slow Dishes" },
  ];
  const unselected = slot("dinner", { categoryOptions: options });
  assert.match(views.actionText("2026-08-16", "dinner", unselected), /choose 🍢 Iranian Grills or 🍲 Iranian Stews &amp; Slow Dishes/);
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
      { catId: 2, emoji: "🍢", name: "Iranian Grills" },
      { catId: 3, emoji: "🍲", name: "Iranian Stews & Slow Dishes" },
    ] },
  ]);
  const text = views.weeklyPlanText(value, "Dinners for the week");
  assert.match(text, /2026-08-17 → 2026-08-23/);
  assert.match(text, /✅ <b>Mon<\/b> Lemon salmon/);
  assert.match(text, /⬜ <b>Tue<\/b>/);
  assert.match(text, /✅ <b>Wed<\/b>/);
  assert.match(text, /🍢 Iranian Grills or 🍲 Iranian Stews &amp; Slow Dishes/);
  assert.match(text, /<b>4 dinners still open\.<\/b>/);

  const keyboard = views.weeklyPlanKeyboard(value);
  const buttons = JSON.stringify(keyboard);
  // ":w" marks the weekly plan as the screen to come back to.
  assert.match(buttons, /"pick:meal:2026-08-18:dinner:w"/);
  assert.match(buttons, /"pick:meal:2026-08-23:dinner:w"/);
  // Days that are already settled never come back as a button.
  assert.doesNotMatch(buttons, /pick:meal:2026-08-17:dinner/);
  assert.doesNotMatch(buttons, /pick:meal:2026-08-19:dinner/);
  assert.doesNotMatch(buttons, /pick:meal:2026-08-21:dinner/);
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
  assert.match(JSON.stringify(views.mealsKeyboard("2026-08-19", "2026-08-20")), /"nav:planweek:m"/);
});

test("back always returns to the screen the panel was opened from", () => {
  const dinner = slot("dinner", { categoryOptions: [{ catId: 6, emoji: "🐟", name: "Seafood" }], category: { catId: 6, emoji: "🐟", name: "Seafood" } });
  function back(keyboard) {
    return keyboard.inline_keyboard.at(-1)[0];
  }
  // Opened from the Sunday plan message, from home, and from a day view.
  assert.equal(back(views.actionKeyboard("2026-08-19", "dinner", dinner, "w")).callback_data, "nav:planweek");
  assert.equal(back(views.actionKeyboard("2026-08-19", "dinner", dinner, "h")).callback_data, "nav:home");
  assert.equal(back(views.actionKeyboard("2026-08-19", "dinner", dinner, "d")).callback_data, "nav:day:2026-08-19");
  // Buttons from before this change carry no origin and fall back to the day.
  assert.equal(back(views.actionKeyboard("2026-08-19", "dinner", dinner, "")).callback_data, "nav:day:2026-08-19");
  // Junk in the callback never becomes a screen.
  assert.equal(back(views.actionKeyboard("2026-08-19", "dinner", dinner, "zz")).callback_data, "nav:day:2026-08-19");
  assert.equal(views.originTarget("w"), "nav:planweek");
  assert.equal(views.originTarget("", ""), "nav:meals");
  assert.equal(back(views.weekKeyboard("h")).callback_data, "nav:home");
  assert.equal(back(views.weekKeyboard("w")).callback_data, "nav:planweek");
  // Every action on the panel keeps the same origin, so the plan update lands back there.
  const data = JSON.stringify(views.actionKeyboard("2026-08-19", "dinner", dinner, "w"));
  for (const action of ["do:suggest", "do:own", "do:leftovers", "do:buy", "do:out", "do:skip"]) {
    assert.match(data, new RegExp(`"${action}:2026-08-19:dinner:w"`));
  }
});

test("an ingredients reply round trip carries its own dish, date, and meal", () => {
  const prompt = views.ingredientsPromptText("2026-08-16", "dinner", "Ghormeh sabzi · grandma's", false);
  assert.match(prompt, /do not know this dish/);
  assert.deepEqual(views.parseIngredientsPromptText(prompt), {
    name: "Ghormeh sabzi · grandma's",
    date: "2026-08-16",
    meal: "dinner",
  });
  assert.match(views.ingredientsPromptText("2026-08-16", "dinner", "Lasagne", true), /could not look its ingredients up/);
  assert.equal(views.parseIngredientsPromptText("What are you cooking for 2026-08-16 · Dinner?"), null);
  assert.deepEqual(views.parseIngredientList("- 500 g lamb\n• 2 onions,  1 tbsp oil \n\n"), ["500 g lamb", "2 onions", "1 tbsp oil"]);
  assert.deepEqual(views.parseIngredientList("   "), []);
  assert.match(views.ownDishSavedText("2026-08-16", "dinner", "Lasagne", ["500 g beef"]), /🛒 <b>Ingredients<\/b>\n• 500 g beef/);
  assert.doesNotMatch(views.ownDishSavedText("2026-08-16", "dinner", "Lasagne", []), /Ingredients/);
});

test("an own-dish reply round trip carries its own date and meal", () => {
  const prompt = views.ownDishText("2026-08-16", "dinner");
  assert.deepEqual(views.parseOwnDishText(prompt), { date: "2026-08-16", meal: "dinner" });
  assert.equal(views.parseOwnDishText("What are you cooking for tomorrow?"), null);
  assert.equal(views.parseOwnDishText(""), null);
  assert.match(views.ownDishSavedText("2026-08-16", "dinner", "Ghormeh <sabzi>"), /Ghormeh &lt;sabzi&gt;/);
  assert.match(JSON.stringify(views.actionKeyboard("2026-08-16", "dinner", slot("dinner"))), /do:own:2026-08-16:dinner/);
});
