"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
global.__hooks = path.resolve(__dirname, "../..");
const dispatcher = require("../dispatcher.js");
const clock = require("../clock.js");
const service = require("../../meal_planning/service.js");
const views = require("../../telegram/views.js");

// A small in-memory PocketBase: collections are arrays of plain field maps.
class Record {
  constructor(collection) { this.collection = collection; this.id = ""; this.data = {}; }
  set(name, value) { this.data[name] = value; }
  get(name) { return this.data[name]; }
  getString(name) { const v = this.data[name]; return v === undefined || v === null ? "" : String(v); }
  getInt(name) { return Number(this.data[name] || 0); }
  getBool(name) { return Boolean(this.data[name]); }
  getStringSlice(name) { return this.data[name] || []; }
}
global.Record = Record;

function makeApp() {
  const store = { categories: [], dishes: [], meal_assignments: [], meal_suggestions: [], cooked_occurrences: [], dinner_rotation: [] };
  let counter = 1;
  const state = { transactions: 0, failAfterSaves: -1, saves: 0 };
  function snapshot() { return JSON.stringify(store, (k, v) => (k === "collection" ? undefined : v)); }
  const app = {
    store, state,
    findCollectionByNameOrId: (name) => name,
    findRecordById(collection, id) {
      const found = store[collection].find((r) => r.id === id);
      if (!found) throw new Error("not found");
      return found;
    },
    findRecordsByFilter(collection, filter, sort, limit, offset, params) {
      params = params || {};
      let rows = store[collection];
      if (collection === "meal_assignments") rows = rows.filter((r) => r.data.date === params.date && r.data.meal === params.meal);
      else if (collection === "categories" && filter.includes("catId =")) rows = rows.filter((r) => r.getInt("catId") === params.catId);
      else if (collection === "dinner_rotation" && filter.includes("week =")) rows = rows.filter((r) => r.getInt("week") === params.week && r.getInt("weekday") === params.weekday);
      else if (collection === "dishes" && filter.includes("name =")) rows = rows.filter((r) => r.data.name === params.name);
      else if (collection === "meal_suggestions") rows = rows.filter((r) => r.data.date === params.date && r.data.meal === params.meal && r.data.outcome === "pending");
      else if (collection === "cooked_occurrences") rows = rows.filter((r) => (r.data.date === params.date && r.data.meal === params.meal) || r.data.assignment === params.id);
      return limit ? rows.slice(0, limit) : rows.slice();
    },
    save(record) {
      state.saves += 1;
      if (state.failAfterSaves >= 0 && state.saves > state.failAfterSaves) throw new Error("db failure");
      if (!record.id) { record.id = record.collection.slice(0, 2) + counter++; store[record.collection].push(record); }
    },
    delete(record) { store[record.collection] = store[record.collection].filter((r) => r !== record); },
    runInTransaction(fn) {
      state.transactions += 1;
      const before = snapshot();
      const copy = Object.assign(Object.create(app), { runInTransaction: (inner) => inner(copy) });
      try { fn(copy); } catch (error) {
        const restored = JSON.parse(before);
        for (const name of Object.keys(store)) {
          store[name] = store[name].map((r) => {
            const old = restored[name].find((o) => o.id === r.id);
            if (old) r.data = old.data;
            return r;
          }).filter((r) => restored[name].some((o) => o.id === r.id));
        }
        throw error;
      }
    },
  };
  for (let catId = 1; catId <= 12; catId += 1) {
    const c = new Record("categories");
    c.id = "c" + catId;
    Object.assign(c.data, { catId, name_en: "Cat " + catId, name_fa: "x", emoji: "🍲", style: "s", effort: "easy", effort_min: 1, effort_max: 2 });
    store.categories.push(c);
  }
  return app;
}

function addDish(app, id, name) {
  const dish = new Record("dishes");
  dish.id = id;
  dish.data.name = name;
  app.store.dishes.push(dish);
  return dish;
}

const TODAY = "2026-11-04";
let nextId = 1;
let app = makeApp();
function reset() { app = makeApp(); }

function call(name, args, today) {
  const original = clock.localNow;
  clock.localNow = () => ({ date: today || TODAY, time: "10:00", timezone: "Europe/Amsterdam" });
  const lines = [];
  const log = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  try {
    const r = dispatcher.handle({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } }, { app }).result;
    r.logs = lines.filter((l) => l.startsWith("MCP action:"));
    return r;
  } finally { console.log = log; clock.localNow = original; }
}
const dinner = (r) => r.structuredContent.meals.dinner;

test("write tools reject past dates with past_date and change nothing", () => {
  reset();
  addDish(app, "d1", "Kabab");
  for (const [name, args] of [
    ["set_dinner", { date: "2026-11-03", dishName: "X" }],
    ["set_dinner_status", { date: "2026-11-03", status: "skipped" }],
    ["clear_dinner", { date: "2026-11-03" }],
    ["set_day_category", { date: "2026-11-03", catId: 3 }],
  ]) {
    const r = call(name, args);
    assert.equal(r.isError, true, name);
    assert.equal(r.structuredContent.code, "past_date", name);
    assert.equal(app.store.meal_assignments.length, 0, name);
    assert.equal(app.store.dishes.length, 1, name);
    assert.deepEqual(r.logs, [], name);
  }
  // today itself is allowed
  assert.equal(call("set_dinner_status", { date: TODAY, status: "skipped" }).isError, undefined);
});

test("set_dinner on a Saturday stores the dish and reports planned", () => {
  reset();
  const r = call("set_dinner", { date: "2026-11-07", dishName: "Pizza Night" });
  assert.equal(r.isError, undefined);
  assert.equal(r.structuredContent.date, "2026-11-07");
  assert.equal(dinner(r).status, "planned");
  assert.equal(dinner(r).dish.name, "Pizza Night");
  assert.equal(dinner(r).selectionSource, "mcp");
  assert.equal(dinner(r).category, null);
  const week = call("get_week", { date: "2026-11-07" }).structuredContent;
  assert.equal(week.days[5].meals.dinner.status, "planned");
});

test("set_dinner creates an unknown dish in the effective category and rejects pending suggestions", () => {
  reset();
  const pending = new Record("meal_suggestions");
  Object.assign(pending.data, { date: "2026-11-05", meal: "dinner", outcome: "pending" });
  const other = new Record("meal_suggestions");
  Object.assign(other.data, { date: "2026-11-06", meal: "dinner", outcome: "pending" });
  app.save(pending); app.save(other);
  const r = call("set_dinner", { date: "2026-11-05", dishName: "  New   Stew ", ingredients: ["rice", "lamb"] });
  assert.equal(dinner(r).dish.name, "New Stew");
  assert.equal(app.store.dishes.length, 1);
  const created = app.store.dishes[0];
  const rotationCat = dinner(r).category.catId;
  assert.equal(created.getInt("catId"), rotationCat);
  assert.deepEqual(created.get("ingredients"), ["rice", "lamb"]);
  assert.equal(pending.data.outcome, "rejected");
  assert.equal(pending.data.rejection_reason, "manual_choice");
  assert.equal(other.data.outcome, "pending");
});

test("set_dinner reuses an existing dish by id or exact name", () => {
  reset();
  addDish(app, "d1", "Kabab");
  addDish(app, "d2", "Omelette");
  assert.equal(dinner(call("set_dinner", { date: "2026-11-05", dishId: "d2" })).dish.id, "d2");
  assert.equal(dinner(call("set_dinner", { date: "2026-11-06", dishName: "Kabab" })).dish.id, "d1");
  assert.equal(app.store.dishes.length, 2);
  assert.equal(app.store.meal_assignments.length, 2);
  // replaces an earlier plan for the day
  assert.equal(dinner(call("set_dinner", { date: "2026-11-05", dishId: "d1" })).dish.id, "d1");
  assert.equal(app.store.meal_assignments.length, 2);
});

test("set_dinner validates its arguments", () => {
  reset();
  for (const args of [
    { date: "2026-11-05" },
    { date: "2026-11-05", dishId: "d1", dishName: "x" },
    { date: "2026-11-05", dishName: "   " },
    { date: "2026-11-05", dishName: "x", ingredients: [1] },
    { date: "2026-11-05", dishName: "x", ingredients: new Array(51).fill("a") },
    { date: "2026-11-05", dishName: "x", extra: 1 },
    { date: "2026-02-30", dishName: "x" },
    { dishName: "x" },
  ]) {
    const r = call("set_dinner", args);
    assert.equal(r.isError, true, JSON.stringify(args).slice(0, 80));
    assert.equal(r.structuredContent.code, "invalid_params");
  }
  const missing = call("set_dinner", { date: "2026-11-05", dishId: "nope" });
  assert.equal(missing.structuredContent.code, "dish_not_found");
  assert.equal(app.store.meal_assignments.length, 0);
  assert.equal(app.store.dishes.length, 0);
});

test("MCP writes use selection_source mcp while Telegram paths keep telegram", () => {
  reset();
  call("set_dinner", { date: "2026-11-05", dishName: "A" });
  call("set_dinner_status", { date: "2026-11-06", status: "leftovers" });
  const bySlot = (d) => app.store.meal_assignments.find((a) => a.data.date === d).data.selection_source;
  assert.equal(bySlot("2026-11-05"), "mcp");
  assert.equal(bySlot("2026-11-06"), "mcp");
  service.setManualDish(app, "2026-11-09", "dinner", "B");
  service.setSpecialStatus(app, "2026-11-10", "dinner", "skipped");
  assert.equal(bySlot("2026-11-09"), "telegram");
  assert.equal(bySlot("2026-11-10"), "telegram");
});

test("set_dinner_status stores each allowed status and rejects others", () => {
  reset();
  addDish(app, "d1", "Kabab");
  call("set_dinner", { date: "2026-11-05", dishId: "d1" });
  for (const status of ["leftovers", "buy_food", "eating_out", "skipped"]) {
    const r = call("set_dinner_status", { date: "2026-11-05", status });
    assert.equal(dinner(r).status, status);
    assert.equal(dinner(r).dish, null);
    assert.equal(dinner(r).selectionSource, "mcp");
  }
  for (const status of ["planned", "cooked", "unplanned", "", "Skipped"]) {
    const r = call("set_dinner_status", { date: "2026-11-05", status });
    assert.equal(r.isError, true, status);
  }
  assert.equal(call("set_dinner_status", { date: "2026-11-05" }).isError, true);
  assert.equal(app.store.meal_assignments[0].data.status, "skipped");
});

test("clear_dinner deletes the assignment, but keeps one with cooked occurrences", () => {
  reset();
  call("set_dinner", { date: "2026-11-05", dishName: "A" });
  const r = call("clear_dinner", { date: "2026-11-05" });
  assert.equal(r.isError, undefined);
  assert.equal(dinner(r).status, "unplanned");
  assert.equal(app.store.meal_assignments.length, 0);
  assert.equal(call("clear_dinner", { date: "2026-11-06" }).isError, undefined);

  call("set_dinner", { date: "2026-11-06", dishName: "B" });
  const occurrence = new Record("cooked_occurrences");
  Object.assign(occurrence.data, { date: "2026-11-06", meal: "dinner", assignment: app.store.meal_assignments[0].id });
  app.save(occurrence);
  const blocked = call("clear_dinner", { date: "2026-11-06" });
  assert.equal(blocked.isError, true);
  assert.equal(blocked.structuredContent.code, "has_history");
  assert.equal(app.store.meal_assignments.length, 1);
  assert.equal(app.store.meal_assignments[0].data.status, "planned");
});

test("set_day_category creates a category-only row and get_week shows the override", () => {
  reset();
  const rotationCat = call("get_week", { date: "2026-11-05" }).structuredContent.days[3].meals.dinner.category.catId;
  const newCat = rotationCat === 3 ? 4 : 3;
  const r = call("set_day_category", { date: "2026-11-05", catId: newCat });
  assert.equal(dinner(r).status, "unplanned");
  assert.equal(dinner(r).category.catId, newCat);
  assert.equal(dinner(r).selectionSource, "mcp");
  assert.equal(dinner(r).dish, null);
  assert.equal(call("get_week", { date: "2026-11-05" }).structuredContent.days[3].meals.dinner.category.catId, newCat);
  // Telegram's day view resolves the category through the same service
  assert.equal(service.slotValue(app, "2026-11-05", "dinner").category.catId, newCat);
});

test("set_day_category null restores the rotation and keeps a planned dish; unknown catId changes nothing", () => {
  reset();
  call("set_dinner", { date: "2026-11-05", dishName: "Keep" });
  const rotationCat = call("get_week", { date: "2026-11-05" }).structuredContent.days[3].meals.dinner.category.catId;
  const newCat = rotationCat === 3 ? 4 : 3;
  assert.equal(dinner(call("set_day_category", { date: "2026-11-05", catId: newCat })).category.catId, newCat);
  const cleared = call("set_day_category", { date: "2026-11-05", catId: null });
  assert.equal(dinner(cleared).category.catId, rotationCat);
  assert.equal(dinner(cleared).status, "planned");
  assert.equal(dinner(cleared).dish.name, "Keep");

  const before = JSON.stringify(app.store.meal_assignments.map((a) => a.data));
  const unknown = call("set_day_category", { date: "2026-11-05", catId: 99 });
  assert.equal(unknown.isError, true);
  assert.equal(unknown.structuredContent.code, "unknown_category");
  assert.equal(JSON.stringify(app.store.meal_assignments.map((a) => a.data)), before);

  // a row created only for the override disappears with it
  call("set_day_category", { date: "2026-11-06", catId: 5 });
  assert.equal(app.store.meal_assignments.length, 2);
  const gone = call("set_day_category", { date: "2026-11-06", catId: null });
  assert.equal(dinner(gone).status, "unplanned");
  assert.equal(app.store.meal_assignments.length, 1);
  assert.equal(call("set_day_category", { date: "2026-11-06", catId: 1.5 }).isError, true);
  assert.equal(call("set_day_category", { date: "2026-11-06" }).isError, true);
  assert.equal(call("set_day_category", { date: "2026-11-06", catId: "3" }).isError, true);
});

test("a dinner planned via MCP counts as decided for actionableDinners", () => {
  reset();
  call("set_dinner", { date: "2026-11-05", dishName: "A" });
  call("set_dinner_status", { date: "2026-11-06", status: "buy_food" });
  const week = service.weekValue(app, "2026-11-05");
  const open = views.actionableDinners(week, "2026-11-04").map((d) => d.date);
  assert.equal(open.includes("2026-11-05"), false);
  assert.equal(open.includes("2026-11-06"), false);
  assert.equal(open.includes("2026-11-04"), true);
});

test("each write runs in one transaction, rolls back on failure and logs one action line", () => {
  reset();
  const long = "z".repeat(500);
  const before = app.state.transactions;
  const r = call("set_dinner", { date: "2026-11-05", dishName: long });
  assert.equal(app.state.transactions - before, 1);
  assert.equal(r.logs.length, 1);
  assert.match(r.logs[0], /^MCP action: set_dinner 2026-11-05 -> planned z+$/);
  assert.ok(r.logs[0].endsWith("z".repeat(200)) && !r.logs[0].includes("z".repeat(201)));
  assert.match(call("set_dinner_status", { date: "2026-11-05", status: "skipped" }).logs[0], /^MCP action: set_dinner_status 2026-11-05 -> skipped$/);
  assert.match(call("set_day_category", { date: "2026-11-05", catId: 4 }).logs[0], /^MCP action: set_day_category 2026-11-05 -> catId 4$/);
  assert.match(call("clear_dinner", { date: "2026-11-05" }).logs[0], /^MCP action: clear_dinner 2026-11-05 -> cleared$/);

  reset();
  app.state.failAfterSaves = 1; // dish saves, then the assignment save fails
  const failed = call("set_dinner", { date: "2026-11-05", dishName: "Half" });
  assert.equal(failed.isError, true);
  assert.equal(app.store.dishes.length, 0);
  assert.equal(app.store.meal_assignments.length, 0);
});

// The seeded table from the dinner_rotation migration, as rows.
function seedRotation() {
  const table = { 1: [12, 10, 7, 6, 2, null, 3], 2: [5, 11, 8, 9, 4, null, 1] };
  for (const week of [1, 2]) {
    table[week].forEach((catId, weekday) => {
      const row = new Record("dinner_rotation");
      row.data.week = week;
      row.data.weekday = weekday;
      if (catId === null) row.data.kind = "eat_out";
      else row.data.category = "c" + catId;
      app.save(row);
    });
  }
}
const rotationRows = () => JSON.stringify(app.store.dinner_rotation.map((r) => r.data));
const thursday = () => call("get_week", { date: "2026-11-05" }).structuredContent.days[3].meals.dinner; // rotation week 1, Thursday

test("set_rotation_day updates the matching row, get_rotation and get_week reflect it, and it logs", () => {
  reset();
  seedRotation();
  assert.equal(thursday().category.catId, 6);
  const r = call("set_rotation_day", { week: 1, weekday: 3, catId: 9 });
  assert.equal(r.isError, undefined);
  assert.equal(app.store.dinner_rotation.length, 14);
  assert.deepEqual(r.logs, ["MCP action: set_rotation_day week 1 weekday 3 -> catId 9"]);
  const rotation = call("get_rotation", { from: "2026-11-02", weeks: 1 }).structuredContent;
  assert.equal(rotation.days[3].catId, 9);
  assert.equal(rotation.days[2].catId, 7);
  assert.equal(thursday().category.catId, 9); // unassigned future date follows the new row
  const telegramWeek = views.weeklyPlanText(service.weekValue(app, "2026-11-05"), "Week", "2026-11-04");
  assert.match(telegramWeek, /Thu<\/b> <i>[^<]*<\/i>\n      🧭 🍲 Cat 9/); // Telegram's week view shows it too
  // eat_out switches the row to kind eat_out and the week view to eating_out
  const out = call("set_rotation_day", { week: 1, weekday: 3, catId: "eat_out" });
  assert.match(out.logs[0], /^MCP action: set_rotation_day week 1 weekday 3 -> eat_out$/);
  assert.equal(thursday().status, "eating_out");
  assert.equal(call("get_rotation", { from: "2026-11-02", weeks: 1 }).structuredContent.days[3].kind, "eat_out");
  assert.equal(app.store.dinner_rotation.length, 14);
});

test("set_rotation_day creates the row when the collection is empty", () => {
  reset();
  call("set_rotation_day", { week: 1, weekday: 3, catId: 9 });
  assert.equal(app.store.dinner_rotation.length, 1);
  assert.equal(thursday().category.catId, 9);
  assert.equal(call("get_week", { date: "2026-11-04" }).structuredContent.days[0].meals.dinner.category.catId, 12); // other slots fall back
});

test("a changed rotation row leaves dates with an assignment on their stored category", () => {
  reset();
  seedRotation();
  call("set_day_category", { date: "2026-11-05", catId: 11 });
  call("set_dinner", { date: "2026-11-06", dishName: "Kebab" }); // Friday keeps rotation category 2 via no override
  call("set_rotation_day", { week: 1, weekday: 3, catId: 9 });
  assert.equal(thursday().category.catId, 11);
  const friday = call("get_week", { date: "2026-11-05" }).structuredContent.days[4].meals.dinner;
  assert.equal(friday.dish.name, "Kebab");
});

test("set_rotation_day rejects an unknown catId and changes no row", () => {
  reset();
  seedRotation();
  const before = rotationRows();
  const r = call("set_rotation_day", { week: 1, weekday: 3, catId: 99 });
  assert.equal(r.isError, true);
  assert.equal(r.structuredContent.code, "unknown_category");
  assert.equal(r.logs.length, 0);
  assert.equal(rotationRows(), before);
});

test("set_rotation_day rejects a week outside 1-2 and changes no row", () => {
  reset();
  seedRotation();
  const before = rotationRows();
  for (const week of [0, 3, 1.5, "1"]) assert.equal(call("set_rotation_day", { week, weekday: 3, catId: 9 }).isError, true, String(week));
  assert.equal(rotationRows(), before);
});

test("set_rotation_day rejects a weekday outside 0-6 and changes no row", () => {
  reset();
  seedRotation();
  const before = rotationRows();
  for (const weekday of [-1, 7, 2.5, "3"]) assert.equal(call("set_rotation_day", { week: 1, weekday, catId: 9 }).isError, true, String(weekday));
  assert.equal(rotationRows(), before);
});
