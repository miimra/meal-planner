import { test } from "node:test";
import assert from "node:assert/strict";
import { planForDay, planLabel, rotationWeekOf } from "./rotation.ts";
import type { Category } from "./categories.ts";

const fixtureCategories: Category[] = [
  {
    pbId: "abc123",
    catId: 5,
    name_en: "International Mains",
    name_fa: "غذای اصلی بین‌المللی",
    emoji: "🌍",
    style: "international",
    effort: "medium",
    effort_minutes: [30, 45],
  },
];

test("planForDay returns a categoryId for a weekday", () => {
  const plan = planForDay(1, 0); // Monday, week 1
  assert.equal(plan.kind, "weekday");
  assert.equal(plan.categoryId, 5);
});

test("planForDay marks Saturday as eat-out", () => {
  const plan = planForDay(1, 5);
  assert.equal(plan.kind, "eat-out");
  assert.equal(plan.categoryId, undefined);
});

test("planForDay offers two choices on Sunday", () => {
  const plan = planForDay(1, 6);
  assert.equal(plan.kind, "sunday-choice");
  assert.deepEqual(plan.choiceIds, [2, 3]);
});

test("planLabel resolves a weekday plan against known categories", () => {
  const plan = planForDay(1, 0);
  const label = planLabel(plan, fixtureCategories);
  assert.equal(label.title, "International Mains");
  assert.equal(label.emoji, "🌍");
  assert.equal(label.fa, "غذای اصلی بین‌المللی");
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
