"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
global.__hooks = path.resolve(__dirname, "../..");
global.$os = { getenv: () => "" };

// Stateful stand-in for PocketBase's app and Record (the real queries and
// transactions are covered by test/mcp-catalog-write.integration.test.js).
class FakeRecord {
  constructor(collection) {
    this.collection = collection;
    this.id = "";
    this.data = {};
  }
  set(name, value) { this.data[name] = value; }
  get(name) { return this.data[name]; }
  getString(name) { const v = this.data[name]; return v === undefined || v === null ? "" : String(v); }
  getInt(name) { return Number(this.data[name] || 0); }
  getBool(name) { return Boolean(this.data[name]); }
  getStringSlice(name) { return this.data[name] || []; }
}
global.Record = FakeRecord;

function makeApp() {
  const tables = { categories: [], dishes: [] };
  let counter = 0;
  const app = {
    tables,
    transactions: 0,
    findCollectionByNameOrId: (name) => name,
    findRecordsByFilter(collection, filter, sort) {
      const rows = tables[collection].slice();
      const key = sort || "name";
      return rows.sort((a, b) => (a.get(key) > b.get(key) ? 1 : -1));
    },
    findRecordById(collection, id) {
      const found = tables[collection].find((r) => r.id === id);
      if (!found) throw new Error("not found");
      return found;
    },
    save(record) {
      if (!record.id) { counter += 1; record.id = "r" + counter; tables[record.collection].push(record); }
    },
    runInTransaction(fn) { app.transactions += 1; fn(app); },
  };
  return app;
}

function seed(app) {
  const add = (collection, id, data) => { const r = new FakeRecord(collection); r.id = id; r.data = data; app.tables[collection].push(r); };
  add("categories", "c1", { catId: 1, name_en: "Quick", name_fa: "سریع", emoji: "🍳", style: "iranian", effort: "quick", effort_min: 15, effort_max: 35, weekend_only: false, prep_ahead: false, notes: "n" });
  add("categories", "c7", { catId: 7, name_en: "Pasta", name_fa: "پاستا", emoji: "🍝", style: "international", effort: "quick", effort_min: 20, effort_max: 45, weekend_only: false, prep_ahead: false, notes: "" });
  add("dishes", "d1", { name: "Omelette", catId: 1, categories: ["c1"], ingredients: ["eggs"], instructions: ["Fry"], prep_minutes: 5, cook_minutes: 5, difficulty: "easy", cuisine: "intl", tags: [], notes: "" });
  add("dishes", "d2", { name: "Pasta", catId: 7, categories: [], ingredients: [], instructions: [], prep_minutes: 0, cook_minutes: 10, difficulty: "", cuisine: "", tags: [], notes: "" });
}

const dispatcher = require("../dispatcher.js");
let nextId = 1;
function call(app, name, args) {
  const logs = [];
  const original = console.log;
  console.log = (line) => logs.push(line);
  try {
    const response = dispatcher.handle({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } }, { app });
    return { result: response.result, logs: logs.filter((l) => l.startsWith("MCP action")) };
  } finally {
    console.log = original;
  }
}

function snapshot(app) {
  return JSON.stringify([app.tables.categories.map((r) => [r.id, r.data]), app.tables.dishes.map((r) => [r.id, r.data])]);
}

test("update_category rejects unknown fields and wrong types and changes nothing", () => {
  const app = makeApp(); seed(app);
  const before = snapshot(app);
  for (const args of [
    { catId: 1, bogus: 1 },
    { catId: 1, name_en: 5 },
    { catId: 1, effort_min: "10" },
    { catId: 1, weekend_only: "yes" },
    { catId: 1, style: "martian" },
    { catId: 1, name_en: "  " },
    { catId: 1, effort_min: 1.5 },
    { catId: "1", name_en: "x" },
  ]) {
    const { result } = call(app, "update_category", args);
    assert.equal(result.isError, true, JSON.stringify(args));
  }
  assert.equal(snapshot(app), before);
});

test("update_category rejects effort_min above effort_max, also against the stored value", () => {
  const app = makeApp(); seed(app);
  const before = snapshot(app);
  assert.equal(call(app, "update_category", { catId: 1, effort_min: 50, effort_max: 40 }).result.isError, true);
  const stored = call(app, "update_category", { catId: 1, effort_min: 36 });
  assert.equal(stored.result.isError, true);
  assert.match(stored.result.content[0].text, /effort_min/);
  assert.equal(call(app, "update_category", { catId: 1, effort_max: 10 }).result.isError, true);
  assert.equal(snapshot(app), before);
});

test("update_category updates only the given fields, keeps catId and returns the read shape", () => {
  const app = makeApp(); seed(app);
  const { result, logs } = call(app, "update_category", { catId: 7, name_en: "Pasta & Noodles", effort_max: 50, weekend_only: true });
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.structuredContent, {
    id: "c7", catId: 7, name: "Pasta & Noodles", nameFa: "پاستا", emoji: "🍝", style: "international", effort: "quick",
    effortMinutes: { min: 20, max: 50 }, weekendOnly: true, prepAhead: false, notes: null,
  });
  assert.equal(app.tables.categories[0].getString("name_en"), "Quick");
  assert.equal(app.transactions, 1);
  assert.deepEqual(logs, ["MCP action: update_category 7 -> ok"]);
  assert.equal(call(app, "update_category", { catId: 99, name_en: "x" }).result.isError, true);
});

test("create_category assigns max(catId) + 1 and returns the category", () => {
  const app = makeApp(); seed(app);
  const { result, logs } = call(app, "create_category", { name_en: "Desserts", emoji: "🍰", effort_min: 5 });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.catId, 8);
  assert.equal(result.structuredContent.name, "Desserts");
  assert.equal(result.structuredContent.emoji, "🍰");
  assert.deepEqual(result.structuredContent.effortMinutes, { min: 5, max: 60 });
  assert.equal(app.tables.categories.length, 3);
  assert.equal(app.transactions, 1);
  assert.deepEqual(logs, ["MCP action: create_category 8 -> created"]);
  assert.equal(call(app, "create_category", { name_en: "Next" }).result.structuredContent.catId, 9);
});

test("create_category with an empty name_en or inconsistent effort creates nothing", () => {
  const app = makeApp(); seed(app);
  const before = snapshot(app);
  for (const args of [{ name_en: "" }, { name_en: "   " }, {}, { name_en: "X", effort_min: 90 }, { name_en: "X", bogus: true }]) {
    assert.equal(call(app, "create_category", args).result.isError, true, JSON.stringify(args));
  }
  assert.equal(snapshot(app), before);
});

test("upsert_dish creates without id and partially updates with id", () => {
  const app = makeApp(); seed(app);
  const created = call(app, "upsert_dish", { name: "  Ghormeh   Sabzi ", catId: 1, ingredients: ["herbs", " beef "], prep_minutes: 30, difficulty: "hard", tags: ["meal:dinner"] });
  assert.equal(created.result.isError, undefined);
  const dish = created.result.structuredContent;
  assert.equal(dish.name, "Ghormeh Sabzi");
  assert.equal(dish.catId, 1);
  assert.deepEqual(dish.relatedCategories, [{ catId: 1, name: "Quick" }]);
  assert.deepEqual(dish.ingredients, ["herbs", "beef"]);
  assert.equal(dish.prepMinutes, 30);
  assert.equal(dish.difficulty, "hard");
  assert.deepEqual(dish.instructions, []);
  assert.match(created.logs[0], new RegExp(`^MCP action: upsert_dish ${dish.id} -> created$`));

  const updated = call(app, "upsert_dish", { id: dish.id, notes: "Spicy", cook_minutes: 120, categoryIds: [7] });
  const next = updated.result.structuredContent;
  assert.equal(next.id, dish.id);
  assert.equal(next.name, "Ghormeh Sabzi");
  assert.equal(next.notes, "Spicy");
  assert.equal(next.cookMinutes, 120);
  assert.equal(next.prepMinutes, 30);
  assert.deepEqual(next.relatedCategories, [{ catId: 7, name: "Pasta" }]);
  assert.equal(app.tables.dishes.length, 3);
  assert.equal(app.transactions, 2);
  assert.match(updated.logs[0], /-> updated$/);
});

test("upsert_dish rejects a name used by another dish with name_taken and changes nothing", () => {
  const app = makeApp(); seed(app);
  const before = snapshot(app);
  const create = call(app, "upsert_dish", { name: "omelette" });
  assert.equal(create.result.isError, true);
  assert.match(create.result.content[0].text, /name_taken/);
  const rename = call(app, "upsert_dish", { id: "d2", name: "Omelette", notes: "changed" });
  assert.equal(rename.result.isError, true);
  assert.match(rename.result.content[0].text, /name_taken/);
  assert.match(rename.logs[0], /^MCP action: upsert_dish d2 -> error name_taken/);
  assert.equal(snapshot(app), before);
  assert.equal(call(app, "upsert_dish", { id: "d1", name: "Omelette", notes: "same name is fine" }).result.isError, undefined);
});

test("upsert_dish validates arguments and references", () => {
  const app = makeApp(); seed(app);
  const before = snapshot(app);
  for (const args of [
    {}, { name: "" }, { name: 5 }, { name: "X", bogus: 1 }, { name: "X", ingredients: "eggs" }, { name: "X", ingredients: [1] },
    { name: "X", difficulty: "brutal" }, { name: "X", prep_minutes: -1 }, { name: "X", catId: 42 }, { name: "X", categoryIds: [1, 42] },
    { id: "missing", notes: "x" },
  ]) {
    assert.equal(call(app, "upsert_dish", args).result.isError, true, JSON.stringify(args));
  }
  assert.equal(snapshot(app), before);
});

test("the write tools are listed with an input schema and readOnlyHint false; log text is capped at 200 characters", () => {
  const response = dispatcher.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {});
  for (const name of ["update_category", "create_category", "upsert_dish"]) {
    const tool = response.result.tools.find((t) => t.name === name);
    assert.ok(tool, name);
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.annotations.readOnlyHint, false);
  }
  const app = makeApp(); seed(app);
  const long = "x".repeat(500);
  const { logs } = call(app, "upsert_dish", { id: long, name: "Y" });
  assert.match(logs[0], /^MCP action: upsert_dish x+ -> error not_found/);
  assert.ok(logs[0].split(" -> ")[0].length <= "MCP action: upsert_dish ".length + 200);
  const text = call(app, "create_category", { name_en: "Z".repeat(500) });
  assert.equal(text.result.isError, undefined);
});

test("bulk_upsert_dishes creates and partially updates dishes and returns them in the get_dish shape in input order", () => {
  const app = makeApp(); seed(app);
  const { result, logs } = call(app, "bulk_upsert_dishes", { dishes: [
    { name: "Zucchini Soup", catId: 7, categoryIds: [1, 7], ingredients: ["zucchini"], difficulty: "easy" },
    { id: "d1", cook_minutes: 9, notes: "less salt" },
    { name: "Apple Pie", instructions: ["Bake"] },
  ] });
  assert.equal(result.isError, undefined, JSON.stringify(result));
  const dishes = result.structuredContent.dishes;
  assert.deepEqual(dishes.map((d) => d.name), ["Zucchini Soup", "Omelette", "Apple Pie"]);
  assert.equal(dishes[0].catId, 7);
  assert.deepEqual(dishes[0].relatedCategories.map((c) => c.catId), [1, 7]);
  assert.equal(dishes[1].cookMinutes, 9);
  assert.equal(dishes[1].notes, "less salt");
  assert.deepEqual(dishes[1].ingredients, ["eggs"]);
  assert.deepEqual(dishes[2].instructions, ["Bake"]);
  assert.equal(app.tables.dishes.length, 4);
  // each result equals what get_dish returns for the same dish
  for (const dish of dishes) {
    assert.deepEqual(call(app, "get_dish", { id: dish.id }).result.structuredContent, dish);
  }
  assert.equal(app.transactions, 1);
  assert.deepEqual(logs, ["MCP action: bulk_upsert_dishes bulk -> created 2, updated 1"]);
});

test("bulk_upsert_dishes accepts exactly 50 dishes and rejects 51 without writing", () => {
  const app = makeApp(); seed(app);
  const make = (n) => Array.from({ length: n }, (_, i) => ({ name: "Bulk " + i }));
  const before = snapshot(app);
  const over = call(app, "bulk_upsert_dishes", { dishes: make(51) }).result;
  assert.equal(over.isError, true);
  assert.equal(snapshot(app), before);
  assert.equal(call(app, "bulk_upsert_dishes", { dishes: [] }).result.isError, true);
  const ok = call(app, "bulk_upsert_dishes", { dishes: make(50) }).result;
  assert.equal(ok.isError, undefined);
  assert.equal(ok.structuredContent.dishes.length, 50);
  assert.equal(app.tables.dishes.length, 52);
});

test("bulk_upsert_dishes fails on any invalid item, names its index and writes nothing", () => {
  const app = makeApp(); seed(app);
  const before = snapshot(app);
  const good = [{ name: "Fine One" }, { id: "d2", notes: "ok" }];
  const cases = [
    [{ name: "Bad Cat", catId: 99 }, "invalid_params"],
    [{ name: "Bad Related", categoryIds: [1, 99] }, "invalid_params"],
    [{ name: "omelette" }, "name_taken"],
    [{ name: "FINE one" }, "name_taken"],
    [{ id: "nope", notes: "x" }, "not_found"],
    [{ id: "d2", notes: "again" }, "invalid_params"],
    [{ id: "d1", name: "Pasta" }, "name_taken"],
    [{ notes: "no name when creating" }, "invalid_params"],
    [{ name: "x", bogus: 1 }, "invalid_params"],
    [{ name: "x", prep_minutes: -1 }, "invalid_params"],
  ];
  for (const [bad, code] of cases) {
    const { result, logs } = call(app, "bulk_upsert_dishes", { dishes: good.concat([bad]) });
    const label = JSON.stringify(bad);
    assert.equal(result.isError, true, label);
    assert.equal(result.structuredContent.code, code, label);
    assert.match(result.content[0].text, /dishes\[2\]/, label);
    assert.equal(snapshot(app), before, label);
    assert.equal(logs.length, 1, label);
  }
  const notObject = call(app, "bulk_upsert_dishes", { dishes: [{ name: "a" }, 5] }).result;
  assert.equal(notObject.isError, true);
  assert.match(notObject.content[0].text, /dishes\[1\]/);
  assert.equal(snapshot(app), before);
});

test("bulk_upsert_dishes lets a later item reuse a name freed by a rename, and upsert_dish is unchanged", () => {
  const app = makeApp(); seed(app);
  // renaming a dish frees its old name for a later item in the same list
  const r = call(app, "bulk_upsert_dishes", { dishes: [{ id: "d1", name: "Frittata" }, { name: "Omelette" }] }).result;
  assert.equal(r.isError, undefined, JSON.stringify(r));
  assert.deepEqual(r.structuredContent.dishes.map((d) => d.name), ["Frittata", "Omelette"]);
  const single = call(app, "upsert_dish", { name: "Frittata" }).result;
  assert.equal(single.structuredContent.code, "name_taken");
});
