import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_ROTATION,
  planForDate,
  planForDay,
  planLabel,
  rotationTableFromRecords,
  rotationWeekOf,
  type RotationRecord,
  type RotationTable,
} from "./rotation.ts";
import type { Category } from "./categories.ts";

// The rows the dinner_rotation migration seeds, shaped as PocketBase returns
// them with `expand: "category"`.
const SEED = { 1: [12, 10, 7, 6, 2, null, 3], 2: [5, 11, 8, 9, 4, null, 1] };
function seedRecords(): RotationRecord[] {
  const records: RotationRecord[] = [];
  for (const week of [1, 2]) {
    SEED[week as 1 | 2].forEach((catId, weekday) => {
      records.push(
        catId === null
          ? { week, weekday, kind: "eat_out", category: "" }
          : { week, weekday, kind: "", category: "rec" + catId, expand: { category: { catId } } },
      );
    });
  }
  return records;
}
const rotation: RotationTable = rotationTableFromRecords(seedRecords());

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
  const plan = planForDay(rotation, 1, 0); // Monday, week 1
  assert.equal(plan.kind, "weekday");
  assert.equal(plan.categoryId, 12);
});

test("planForDay follows the two-week table Monday through Sunday", () => {
  const ids = (week: 1 | 2) => [0, 1, 2, 3, 4, 5, 6].map((day) => planForDay(rotation, week, day as 0 | 1 | 2 | 3 | 4 | 5 | 6).categoryId);
  assert.deepEqual(ids(1), [12, 10, 7, 6, 2, undefined, 3]);
  assert.deepEqual(ids(2), [5, 11, 8, 9, 4, undefined, 1]);
});

test("planForDay marks Saturday as eat-out in both weeks", () => {
  for (const week of [1, 2] as const) {
    const plan = planForDay(rotation, week, 5);
    assert.equal(plan.kind, "eat-out");
    assert.equal(plan.categoryId, undefined);
  }
});

test("planForDay gives Sunday a fixed category per week", () => {
  assert.equal(planForDay(rotation, 1, 6).kind, "weekday");
  assert.equal(planForDay(rotation, 1, 6).categoryId, 3);
  assert.equal(planForDay(rotation, 2, 6).categoryId, 1);
});

test("planLabel resolves a weekday plan against known categories", () => {
  const plan = planForDay(rotation, 1, 0);
  const label = planLabel(plan, fixtureCategories);
  assert.equal(label.title, "Pizza");
  assert.equal(label.emoji, "🍕");
  assert.equal(label.fa, "پیتزا");
});

test("planLabel falls back gracefully when categories haven't loaded yet", () => {
  const plan = planForDay(rotation, 1, 0);
  const label = planLabel(plan, []);
  assert.equal(label.title, "Unknown");
});

test("rotationWeekOf alternates every 2 weeks from the Jan 1 2024 anchor", () => {
  assert.equal(rotationWeekOf(new Date(2024, 0, 1)), 1);
  assert.equal(rotationWeekOf(new Date(2024, 0, 8)), 2);
  assert.equal(rotationWeekOf(new Date(2024, 0, 15)), 1);
});

test("rotationTableFromRecords maps fetched rows, so a changed row changes the lookup", () => {
  const records = seedRecords();
  const monday = records.find((r) => r.week === 1 && r.weekday === 0)!;
  monday.expand = { category: { catId: 4 } };
  const thursday = records.find((r) => r.week === 1 && r.weekday === 3)!;
  thursday.kind = "eat_out";
  thursday.expand = undefined;
  const table = rotationTableFromRecords(records);
  assert.equal(planForDay(table, 1, 0).categoryId, 4);
  assert.equal(planForDay(table, 1, 3).kind, "eat-out");
  assert.equal(planForDay(table, 2, 0).categoryId, 5);
});

test("planForDate resolves a date through the fetched rotation using the week-parity rule", () => {
  // 2026-08-10 is a week-1 Monday, 2026-08-17 a week-2 Monday.
  assert.equal(planForDate(rotation, new Date(2026, 7, 10)).categoryId, 12);
  assert.equal(planForDate(rotation, new Date(2026, 7, 17)).categoryId, 5);
  assert.equal(planForDate(rotation, new Date(2026, 7, 15)).kind, "eat-out");
});

test("slots missing from the fetched rows are unset, and unknown rows are ignored", () => {
  assert.equal(planForDay(EMPTY_ROTATION, 1, 0).kind, "unset");
  const table = rotationTableFromRecords([
    { week: 3, weekday: 0, kind: "eat_out" },
    { week: 1, weekday: 9, kind: "eat_out" },
    { week: 1, weekday: 2, category: "x", expand: { category: { catId: 7 } } },
  ]);
  assert.equal(planForDay(table, 1, 0).kind, "unset");
  assert.equal(planForDay(table, 1, 2).categoryId, 7);
  assert.equal(planLabel(planForDay(table, 1, 0), []).title, "Unknown");
});
