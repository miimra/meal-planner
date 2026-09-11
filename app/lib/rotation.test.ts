import { test } from "node:test";
import assert from "node:assert/strict";
import { planForDay, planLabel, rotationWeekOf } from "./rotation.ts";
import type { Category } from "./categories.ts";

const fixtureCategories: Category[] = [
  {
    pbId: "abc123",
    catId: 12,
    name_en: "Pizza",
    name_fa: "پیتزا",
    emoji: "🍕",
    style: "international",
    effort: "medium",
    effort_minutes: [30, 45],
  },
];

test("planForDay returns a categoryId for a weekday", () => {
  const plan = planForDay(1, 0); // Monday, week 1
  assert.equal(plan.kind, "weekday");
  assert.equal(plan.categoryId, 12);
});

test("planForDay follows the two-week table Monday through Sunday", () => {
  const ids = (week: 1 | 2) => [0, 1, 2, 3, 4, 5, 6].map((day) => planForDay(week, day as 0 | 1 | 2 | 3 | 4 | 5 | 6).categoryId);
  assert.deepEqual(ids(1), [12, 10, 7, 6, 2, undefined, 3]);
  assert.deepEqual(ids(2), [5, 11, 8, 9, 4, undefined, 1]);
});

test("planForDay marks Saturday as eat-out in both weeks", () => {
  for (const week of [1, 2] as const) {
    const plan = planForDay(week, 5);
    assert.equal(plan.kind, "eat-out");
    assert.equal(plan.categoryId, undefined);
  }
});

test("planForDay gives Sunday a fixed category per week", () => {
  assert.equal(planForDay(1, 6).kind, "weekday");
  assert.equal(planForDay(1, 6).categoryId, 3);
  assert.equal(planForDay(2, 6).categoryId, 1);
});

test("planLabel resolves a weekday plan against known categories", () => {
  const plan = planForDay(1, 0);
  const label = planLabel(plan, fixtureCategories);
  assert.equal(label.title, "Pizza");
  assert.equal(label.emoji, "🍕");
  assert.equal(label.fa, "پیتزا");
});

test("planLabel falls back gracefully when categories haven't loaded yet", () => {
  const plan = planForDay(1, 0);
  const label = planLabel(plan, []);
  assert.equal(label.title, "Unknown");
});

test("rotationWeekOf alternates every 2 weeks from the Jan 1 2024 anchor", () => {
  assert.equal(rotationWeekOf(new Date(2024, 0, 1)), 1);
  assert.equal(rotationWeekOf(new Date(2024, 0, 8)), 2);
  assert.equal(rotationWeekOf(new Date(2024, 0, 15)), 1);
});
