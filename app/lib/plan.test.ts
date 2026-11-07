import test from "node:test";
import assert from "node:assert/strict";
import { amsterdamToday, buildDay, mealHasPassed, mondayKey } from "./plan.ts";
import type { Category } from "./categories.ts";
import { rotationTableFromRecords, type RotationRecord } from "./rotation.ts";

const SEED = { 1: [12, 10, 7, 6, 2, null, 3], 2: [5, 11, 8, 9, 4, null, 1] };
function seedRecords(): RotationRecord[] {
  const records: RotationRecord[] = [];
  for (const week of [1, 2]) {
    SEED[week as 1 | 2].forEach((catId, weekday) => {
      records.push(catId === null ? { week, weekday, kind: "eat_out" } : { week, weekday, expand: { category: { catId } } });
    });
  }
  return records;
}
const rotation = rotationTableFromRecords(seedRecords());

const categories: Category[] = [{
  pbId: "fish-record",
  catId: 6,
  name_en: "Seafood",
  name_fa: "ماهی و غذاهای دریایی",
  emoji: "🐟",
  style: "either",
  effort: "medium",
  effort_minutes: [25, 45],
}];

test("buildDay covers dinner only, and fills its rotation category", () => {
  // Thursday 2026-08-13 sits in rotation week 1: Seafood.
  const day = buildDay("2026-08-13", categories, [], [], rotation);
  assert.deepEqual(Object.keys(day.meals), ["dinner"]);
  assert.equal(day.meals.dinner.category?.catId, 6);
  assert.equal(day.meals.dinner.dish, null);
  assert.equal(day.meals.dinner.status, "unplanned");
});

test("buildDay gives Sunday its fixed rotation category and Saturday none", () => {
  const sundayCategories: Category[] = [
    ...categories,
    { ...categories[0], pbId: "grill-record", catId: 2, name_en: "Iranian Grills", name_fa: "کباب‌های ایرانی", emoji: "🍢" },
    { ...categories[0], pbId: "stew-record", catId: 3, name_en: "Iranian Stews & Slow Dishes", name_fa: "خورشت و غذای آرام‌پز ایرانی", emoji: "🍲" },
  ];
  // Sunday 2026-08-16 closes rotation week 1 (Iranian Stew); Saturday before it eats out.
  assert.equal(buildDay("2026-08-16", sundayCategories, [], [], rotation).meals.dinner.category?.catId, 3);
  const saturday = buildDay("2026-08-15", sundayCategories, [], [], rotation).meals.dinner;
  assert.equal(saturday.category, null);
  assert.equal(saturday.status, "eating_out");
});

test("buildDay exposes exact assignments and special statuses", () => {
  const day = buildDay(
    "2026-08-12",
    categories,
    [{ id: "salmon", name: "Lemon salmon" }],
    [
      { id: "a", date: "2026-08-12", meal: "dinner", category: "fish-record", dish: "salmon", status: "planned", selection_source: "ai" },
      // A leftover row from the three-meal era must be ignored, not rendered.
      { id: "b", date: "2026-08-12", meal: "lunch", status: "buy_food" },
    ],
    rotation,
  );
  assert.equal(day.meals.dinner.dish?.name, "Lemon salmon");
  assert.equal(day.meals.dinner.category?.name_en, "Seafood");
  assert.deepEqual(Object.keys(day.meals), ["dinner"]);
});

test("buildDay follows a changed rotation row for unassigned dates but not for assigned ones", () => {
  const records = seedRecords();
  // Thursday of week 1 (2026-08-13) becomes Wraps (catId 8) instead of Seafood.
  records.find((r) => r.week === 1 && r.weekday === 3)!.expand = { category: { catId: 8 } };
  const changed = rotationTableFromRecords(records);
  const both: Category[] = [...categories, { ...categories[0], pbId: "wrap-record", catId: 8, name_en: "Wraps" }];
  assert.equal(buildDay("2026-08-13", both, [], [], changed).meals.dinner.category?.catId, 8);
  const assigned = [{ id: "a", date: "2026-08-13", meal: "dinner", category: "fish-record", status: "unplanned" }];
  assert.equal(buildDay("2026-08-13", both, [], assigned as never, changed).meals.dinner.category?.catId, 6);
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
