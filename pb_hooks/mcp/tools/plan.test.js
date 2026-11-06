"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.__hooks = path.resolve(__dirname, "../..");
const dispatcher = require("../dispatcher.js");
const clock = require("../clock.js");
const calendar = require("../../meal_planning/calendar.js");
const service = require("../../meal_planning/service.js");

function record(id, data) {
  return {
    id,
    get: (n) => data[n],
    getString: (n) => (data[n] === undefined || data[n] === null ? "" : String(data[n])),
    getInt: (n) => Number(data[n] || 0),
    getBool: (n) => Boolean(data[n]),
  };
}

const CATEGORIES = [];
for (let catId = 1; catId <= 12; catId += 1) {
  CATEGORIES.push(record("c" + catId, { catId, name_en: "Cat " + catId, name_fa: "فا" + catId, emoji: "🍲", style: "s", effort: "easy", effort_min: 10, effort_max: 30, weekend_only: catId === 1, prep_ahead: false, notes: catId === 2 ? "n" : "" }));
}
const DISHES = [record("d1", { name: "Omelette" }), record("d2", { name: "Kabab" })];
const ASSIGNMENTS = [
  // Monday 2026-11-02: rotation would be cat 12, override to cat 3
  record("a1", { date: "2026-11-02", meal: "dinner", status: "planned", dish: "d1", category: "c3", selection_source: "telegram" }),
  record("a2", { date: "2026-11-04", meal: "dinner", status: "leftovers", dish: "", category: "", selection_source: "" }),
];

const app = {
  findRecordsByFilter(collection, filter, sort, limit, offset, params) {
    if (collection === "meal_assignments") return ASSIGNMENTS.filter((a) => a.get("date") === params.date && a.get("meal") === params.meal);
    if (collection === "categories") return filter.includes("catId =") ? CATEGORIES.filter((c) => c.getInt("catId") === params.catId) : CATEGORIES;
    throw new Error("unexpected collection " + collection);
  },
  findRecordById(collection, id) {
    const list = collection === "dishes" ? DISHES : CATEGORIES;
    const found = list.find((r) => r.id === id);
    if (!found) throw new Error("not found");
    return found;
  },
};

let nextId = 1;
function call(name, args, today) {
  const original = clock.localNow;
  clock.localNow = () => ({ date: today || "2026-11-04", time: "10:00", timezone: "Europe/Amsterdam" });
  try {
    return dispatcher.handle({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } }, { app }).result;
  } finally { clock.localNow = original; }
}

test("get_week without a date returns the current planning week", () => {
  const week = call("get_week", {}, "2026-11-04").structuredContent;
  assert.equal(week.start, "2026-11-02");
  assert.equal(week.end, "2026-11-08");
  assert.equal(week.days.length, 7);
});

test("get_week without a date returns the coming week on Sundays", () => {
  const week = call("get_week", {}, "2026-11-08").structuredContent;
  assert.equal(week.start, "2026-11-09");
  assert.equal(week.end, "2026-11-15");
});

test("get_week with a date returns that week with status, dish, category and source", () => {
  const week = call("get_week", { date: "2026-11-06" }).structuredContent;
  assert.equal(week.start, "2026-11-02");
  const monday = week.days[0].meals.dinner;
  assert.equal(monday.status, "planned");
  assert.deepEqual(monday.dish, { id: "d1", name: "Omelette" });
  assert.equal(monday.selectionSource, "telegram");
  assert.equal(monday.category.catId, 3);
  const wednesday = week.days[2].meals.dinner;
  assert.equal(wednesday.status, "leftovers");
  assert.equal(wednesday.dish, null);
  const tuesday = week.days[1].meals.dinner;
  assert.equal(tuesday.status, "unplanned");
  assert.equal(tuesday.category.catId, 10);
});

test("get_week shows Saturday as eating_out and a category override over the rotation", () => {
  const week = call("get_week", { date: "2026-11-02" }).structuredContent;
  assert.equal(week.days[5].meals.dinner.status, "eating_out");
  assert.equal(week.days[5].meals.dinner.category, null);
  assert.equal(week.days[0].meals.dinner.category.catId, 3);
  assert.equal(calendar.dinnerRotation("2026-11-02").catId, 12);
});

test("get_week rejects a bad date", () => {
  const r = call("get_week", { date: "2026-02-30" });
  assert.equal(r.isError, true);
});

test("get_plan returns one slot per day in the get_week shape", () => {
  const plan = call("get_plan", { from: "2026-11-07", to: "2026-11-10" }).structuredContent;
  assert.deepEqual(plan.days.map((d) => d.date), ["2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"]);
  const week = call("get_week", { date: "2026-11-02" }).structuredContent;
  assert.deepEqual(plan.days[0], week.days[5]);
  assert.deepEqual(plan.days[1], week.days[6]);
  assert.equal(call("get_plan", { from: "2026-11-02", to: "2026-11-02" }).structuredContent.days.length, 1);
});

test("get_plan accepts exactly 62 days and rejects bad input", () => {
  assert.equal(call("get_plan", { from: "2026-11-01", to: "2026-12-32" }).isError, true);
  assert.equal(call("get_plan", { from: "2026-11-01", to: "2026-12-31" }).structuredContent.days.length, 61);
  assert.equal(call("get_plan", { from: "2026-11-01", to: "2027-01-01" }).structuredContent.days.length, 62);
  for (const args of [{ from: "nope", to: "2026-11-02" }, { from: "2026-11-05", to: "2026-11-02" }, { from: "2026-11-01", to: "2027-01-02" }, { from: "2026-11-01" }]) {
    const r = call("get_plan", args);
    assert.equal(r.isError, true, JSON.stringify(args));
    assert.equal(typeof r.content[0].text, "string");
  }
});

test("list_categories returns every category in the categoryValue shape", () => {
  const r = call("list_categories", {}).structuredContent;
  assert.equal(r.categories.length, 12);
  assert.deepEqual(r.categories[1], service.categoryValue(CATEGORIES[1]));
  assert.deepEqual(r.categories[1], {
    id: "c2", catId: 2, name: "Cat 2", nameFa: "فا2", emoji: "🍲", style: "s", effort: "easy",
    effortMinutes: { min: 10, max: 30 }, weekendOnly: false, prepAhead: false, notes: "n",
  });
});

test("get_rotation defaults to 2 weeks from the planning week", () => {
  const r = call("get_rotation", {}, "2026-11-08").structuredContent;
  assert.equal(r.start, "2026-11-09");
  assert.equal(r.days.length, 14);
  assert.equal(r.days[0].date, "2026-11-09");
  assert.equal(r.days[13].date, "2026-11-22");
  for (const day of r.days) {
    const rotation = calendar.dinnerRotation(day.date);
    assert.equal(day.rotationWeek, rotation.rotationWeek);
    if (rotation.kind === "eat_out") assert.deepEqual([day.kind, day.catId, day.category], ["eat_out", null, null]);
    else assert.deepEqual([day.catId, day.category.catId], [rotation.catId, rotation.catId]);
  }
  assert.equal(r.days[5].kind, "eat_out");
});

test("get_rotation honours from and weeks", () => {
  const r = call("get_rotation", { from: "2026-11-04", weeks: 1 }).structuredContent;
  assert.equal(r.start, "2026-11-02");
  assert.equal(r.days.length, 7);
  assert.equal(call("get_rotation", { weeks: 3 }).structuredContent.days.length, 21);
  assert.equal(call("get_rotation", { weeks: 0 }).isError, true);
  assert.equal(call("get_rotation", { weeks: 9 }).isError, true);
  assert.equal(call("get_rotation", { from: "bad" }).isError, true);
});

test("tools are read-only and reuse the shared service and calendar", () => {
  const source = fs.readFileSync(path.join(__dirname, "plan.js"), "utf8");
  assert.match(source, /meal_planning\/service\.js/);
  assert.match(source, /meal_planning\/calendar\.js/);
  for (const fn of ["service.weekValue", "service.dayValue", "service.categoryValue", "calendar.dinnerRotation"]) assert.ok(source.includes(fn), fn);
  assert.doesNotMatch(source, /\.(save|delete|create)\w*\(/);
  const tools = require("./plan.js");
  assert.deepEqual(tools.map((t) => t.name), ["get_week", "get_plan", "list_categories", "get_rotation"]);
  for (const tool of tools) assert.equal(tool.annotations.readOnlyHint, true);
});
