import test from "node:test";
import assert from "node:assert/strict";
import { amsterdamToday, buildDay, mealHasPassed, mondayKey } from "./plan.ts";
import type { Category } from "./categories.ts";

const categories: Category[] = [{
  pbId: "fish-record",
  catId: 6,
  name_en: "Fish & Shrimp",
  name_fa: "ماهی و میگو",
  emoji: "🐟",
  style: "either",
  effort: "medium",
  effort_minutes: [25, 45],
}];

test("buildDay always includes breakfast, lunch, and dinner", () => {
  const day = buildDay("2026-08-12", categories, [], []);
  assert.deepEqual(Object.keys(day.meals), ["breakfast", "lunch", "dinner"]);
  assert.equal(day.meals.breakfast.category, null);
  assert.equal(day.meals.breakfast.dish, null);
});

test("buildDay exposes exact assignments and special statuses", () => {
  const day = buildDay(
    "2026-08-12",
    categories,
    [{ id: "salmon", name: "Lemon salmon" }],
    [
      { id: "a", date: "2026-08-12", meal: "dinner", category: "fish-record", dish: "salmon", status: "planned", selection_source: "ai" },
      { id: "b", date: "2026-08-12", meal: "lunch", status: "buy_food" },
    ],
  );
  assert.equal(day.meals.dinner.dish?.name, "Lemon salmon");
  assert.equal(day.meals.dinner.category?.name_en, "Fish & Shrimp");
  assert.equal(day.meals.lunch.status, "buy_food");
});

test("Amsterdam date and Monday calculations are calendar-safe", () => {
  assert.equal(amsterdamToday(new Date("2026-03-29T22:30:00Z")), "2026-03-30");
  assert.equal(mondayKey("2026-08-16"), "2026-08-10");
});

test("unplanned meals pass at their Amsterdam cutoffs", () => {
  assert.equal(mealHasPassed("2026-08-12", "breakfast", new Date("2026-08-12T09:59:00Z")), false);
  assert.equal(mealHasPassed("2026-08-12", "breakfast", new Date("2026-08-12T10:00:00Z")), true);
  assert.equal(mealHasPassed("2026-08-12", "lunch", new Date("2026-08-12T12:59:00Z")), false);
  assert.equal(mealHasPassed("2026-08-12", "lunch", new Date("2026-08-12T13:00:00Z")), true);
  assert.equal(mealHasPassed("2026-08-12", "dinner", new Date("2026-08-12T18:59:00Z")), false);
  assert.equal(mealHasPassed("2026-08-12", "dinner", new Date("2026-08-12T19:00:00Z")), true);
});

test("meal cutoffs distinguish past and future dates across daylight saving time", () => {
  const afterAmsterdamMidnight = new Date("2026-03-29T22:30:00Z");
  assert.equal(mealHasPassed("2026-03-29", "dinner", afterAmsterdamMidnight), true);
  assert.equal(mealHasPassed("2026-03-30", "breakfast", afterAmsterdamMidnight), false);
  assert.equal(mealHasPassed("2026-03-31", "breakfast", afterAmsterdamMidnight), false);
});
