"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const calendar = require("./calendar.js");
const rotation = require("./rotation.js");

function record(data) {
  return {
    data,
    getInt: (n) => Number(data[n] || 0),
    getString: (n) => (data[n] === undefined || data[n] === null ? "" : String(data[n])),
  };
}

// The 14 rows the dinner_rotation migration seeds, against categories c1..c12.
function seededApp(rows) {
  const SEED = { 1: [12, 10, 7, 6, 2, null, 3], 2: [5, 11, 8, 9, 4, null, 1] };
  const data = rows || [];
  if (!rows) {
    for (const week of [1, 2]) {
      SEED[week].forEach((catId, weekday) => data.push(catId === null ? { week, weekday, kind: "eat_out" } : { week, weekday, category: "c" + catId }));
    }
  }
  return {
    findRecordsByFilter: (collection) => {
      assert.equal(collection, "dinner_rotation");
      return data.map(record);
    },
    findRecordById: (collection, id) => {
      assert.equal(collection, "categories");
      return record({ catId: Number(id.slice(1)) });
    },
  };
}

// Expected result for every day of four weeks from Monday 2026-08-10: week 1, 2, 1, 2.
const WEEK_ONE = [12, 10, 7, 6, 2, null, 3];
const WEEK_TWO = [5, 11, 8, 9, 4, null, 1];

test("the seeded collection gives the same result as the old hardcoded table for a 4-week window", () => {
  const table = rotation.loadTable(seededApp());
  for (let i = 0; i < 28; i += 1) {
    const date = calendar.addDays("2026-08-10", i);
    const week = Math.floor(i / 7) % 2 === 0 ? 1 : 2;
    const expected = (week === 1 ? WEEK_ONE : WEEK_TWO)[i % 7];
    const actual = calendar.dinnerRotation(date, table);
    assert.equal(actual.rotationWeek, week, date);
    if (expected === null) assert.deepEqual(actual, { kind: "eat_out", rotationWeek: week }, date);
    else assert.deepEqual(actual, { kind: "category", rotationWeek: week, catId: expected }, date);
  }
});

test("an empty collection loads as null so dinnerRotation uses the hardcoded table", () => {
  const table = rotation.loadTable(seededApp([]));
  assert.equal(table, null);
  assert.deepEqual(calendar.dinnerRotation("2026-08-10", table), { kind: "category", rotationWeek: 1, catId: 12 });
  assert.equal(calendar.dinnerRotation("2026-08-15", table).kind, "eat_out");
});

test("a changed row shows up in the loaded table", () => {
  const table = rotation.loadTable(seededApp([{ week: 1, weekday: 0, category: "c4" }, { week: 1, weekday: 1, kind: "eat_out" }]));
  assert.equal(calendar.dinnerRotation("2026-08-10", table).catId, 4);
  assert.equal(calendar.dinnerRotation("2026-08-11", table).kind, "eat_out");
  assert.equal(calendar.dinnerRotation("2026-08-12", table).catId, 7); // not in the collection: fallback
});
