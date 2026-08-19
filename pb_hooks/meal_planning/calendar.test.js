"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const calendar = require("./calendar.js");

test("calendar validates real ISO dates", () => {
  assert.equal(calendar.parseDate("2026-08-12").toISOString().slice(0, 10), "2026-08-12");
  assert.throws(() => calendar.parseDate("2026-02-30"), /invalid_date/);
  assert.throws(() => calendar.parseDate("12-08-2026"), /invalid_date/);
});

test("calendar week is always Monday through Sunday", () => {
  assert.deepEqual(calendar.weekBounds("2026-08-10"), { start: "2026-08-10", end: "2026-08-16" });
  assert.deepEqual(calendar.weekBounds("2026-08-16"), { start: "2026-08-10", end: "2026-08-16" });
});

test("dinner rotation preserves weekday, Saturday, and Sunday semantics", () => {
  assert.deepEqual(calendar.dinnerRotation("2026-08-12"), { kind: "category", rotationWeek: 1, catId: 6 });
  assert.equal(calendar.dinnerRotation("2026-08-15").kind, "eat_out");
  assert.deepEqual(calendar.dinnerRotation("2026-08-16").catIds, [2, 3]);
});

test("dinner is the only planned meal and always feeds the baby", () => {
  assert.deepEqual(calendar.MEALS, ["dinner"]);
  assert.deepEqual(calendar.servingProfile("2026-08-12", "dinner"), {
    adults: 2, babies: 1, includesBaby: true, label: "2 adults + 1 baby",
  });
  assert.throws(() => calendar.servingProfile("2026-08-12", "lunch"), /invalid_meal/);
  assert.throws(() => calendar.assertMeal("breakfast"), /invalid_meal/);
});

test("the planning week rolls over on Sunday, when the next week is announced", () => {
  // Sunday 2026-08-16 plans the week starting Monday 2026-08-17.
  assert.equal(calendar.planningWeekStart("2026-08-16"), "2026-08-17");
  // Any other day plans the week already under way.
  assert.equal(calendar.planningWeekStart("2026-08-19"), "2026-08-17");
  assert.equal(calendar.planningWeekStart("2026-08-17"), "2026-08-17");
  assert.deepEqual(calendar.weekDates("2026-08-17").length, 7);
  assert.equal(calendar.weekDates("2026-08-17")[6], "2026-08-23");
});
