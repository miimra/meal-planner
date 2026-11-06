"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
global.__hooks = path.resolve(__dirname, "../..");
const dispatcher = require("../dispatcher.js");

function record(id, data) {
  return {
    id,
    get: (name) => data[name],
    getString: (name) => (data[name] === undefined || data[name] === null ? "" : String(data[name])),
    getInt: (name) => Number(data[name] || 0),
    getStringSlice: (name) => data[name] || [],
  };
}

const CATEGORIES = [
  record("c1", { catId: 1, name_en: "Simple Pan Meals" }),
  record("c2", { catId: 2, name_en: "Kebab & Grill" }),
];
const DISHES = [
  record("d2", { name: "Kabab Koobideh", catId: 2, categories: [], ingredients: ["minced beef", "onion"], instructions: ["Mix", "Grill"], prep_minutes: 20, cook_minutes: 15, difficulty: "medium", cuisine: "iranian", tags: ["meal:dinner"], notes: "Serve with rice" }),
  record("d1", { name: "Omelette", catId: 1, categories: ["c2"], ingredients: ["eggs"], instructions: ["Whisk", "Fry"], prep_minutes: 5, cook_minutes: 5, difficulty: "easy", cuisine: "international", tags: [], notes: "" }),
  record("d3", { name: "Pasta", catId: 1, categories: [], ingredients: ["pasta", "tomato"], instructions: [], prep_minutes: 0, cook_minutes: 12, difficulty: "", cuisine: "", tags: ["quick"], notes: "" }),
];
const MEMBERS = [
  record("m1", { name: "Alex", active: true, preference_notes: "No mushrooms" }),
  record("m2", { name: "Sam", active: true, preference_notes: "" }),
  record("m3", { name: "Old", active: false, preference_notes: "gone" }),
];
const OCCURRENCES = [
  record("o1", { date: "2026-11-02", meal: "dinner", dish: "d1", notes: "", modifications: "extra cheese" }),
  record("o2", { date: "2026-11-03", meal: "dinner", dish: "d2", notes: "good", modifications: "" }),
  record("o3", { date: "2026-11-05", meal: "dinner", dish: "d3", notes: "", modifications: "" }),
];
const FEEDBACK = [
  record("f1", { occurrence: "o2", member: "m1", rating: "liked", make_again: "yes", changes: "less salt" }),
  record("f2", { occurrence: "o2", member: "m2", rating: "okay", make_again: "maybe", changes: "" }),
];

// Stands in for PocketBase's app: serves fixed collections and applies the
// handful of filter shapes the tools use (real filters are covered by the
// PocketBase integration test).
const app = {
  findRecordsByFilter(collection, filter, sort, limit, offset, params) {
    if (collection === "categories") return CATEGORIES;
    if (collection === "dishes") return [...DISHES].sort((a, b) => a.getString("name").localeCompare(b.getString("name")));
    if (collection === "household_members") return filter.includes("active = true") ? MEMBERS.filter((m) => m.get("active")) : MEMBERS;
    if (collection === "cooked_occurrences") return OCCURRENCES.filter((o) => o.get("date") >= params.from && o.get("date") <= params.to);
    if (collection === "meal_feedback") return FEEDBACK.filter((f) => f.get("occurrence") === params.id);
    throw new Error("unexpected collection " + collection);
  },
};

let nextId = 1;
function call(name, args) {
  const response = dispatcher.handle({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } }, { app });
  return response.result;
}

test("list_dishes returns the dish fields, sorted by name", () => {
  const r = call("list_dishes", {});
  assert.equal(r.isError, undefined);
  assert.equal(r.structuredContent.total, 3);
  assert.deepEqual(r.structuredContent.dishes.map((d) => d.name), ["Kabab Koobideh", "Omelette", "Pasta"]);
  assert.deepEqual(r.structuredContent.dishes[1], {
    id: "d1", name: "Omelette", catId: 1,
    relatedCategories: [{ catId: 2, name: "Kebab & Grill" }],
    ingredients: ["eggs"], prepMinutes: 5, cookMinutes: 5, difficulty: "easy", cuisine: "international", tags: [], notes: null,
  });
  assert.equal("instructions" in r.structuredContent.dishes[0], false);
  assert.equal(r.structuredContent.dishes[0].notes, "Serve with rice");
  assert.deepEqual(r.structuredContent.dishes[0].tags, ["meal:dinner"]);
});

test("list_dishes filters by categoryId (primary or related), query and limit", () => {
  assert.deepEqual(call("list_dishes", { categoryId: 1 }).structuredContent.dishes.map((d) => d.id), ["d1", "d3"]);
  assert.deepEqual(call("list_dishes", { categoryId: 2 }).structuredContent.dishes.map((d) => d.id), ["d2", "d1"]);
  assert.deepEqual(call("list_dishes", { query: "TOMATO" }).structuredContent.dishes.map((d) => d.id), ["d3"]);
  assert.deepEqual(call("list_dishes", { query: "iranian" }).structuredContent.dishes.map((d) => d.id), ["d2"]);
  assert.deepEqual(call("list_dishes", { categoryId: 1, query: "egg" }).structuredContent.dishes.map((d) => d.id), ["d1"]);
  const limited = call("list_dishes", { limit: 2 }).structuredContent;
  assert.equal(limited.dishes.length, 2);
  assert.equal(limited.total, 3);
  assert.equal(call("list_dishes", { limit: 0 }).isError, true);
  assert.equal(call("list_dishes", { limit: 201 }).isError, true);
});

test("get_dish by id and by name returns the dish with instructions", () => {
  const byId = call("get_dish", { id: "d2" }).structuredContent;
  assert.equal(byId.name, "Kabab Koobideh");
  assert.deepEqual(byId.instructions, ["Mix", "Grill"]);
  assert.equal(byId.prepMinutes, 20);
  const byName = call("get_dish", { name: "omelette" }).structuredContent;
  assert.equal(byName.id, "d1");
  assert.deepEqual(byName.instructions, ["Whisk", "Fry"]);
  assert.deepEqual(byName.relatedCategories, [{ catId: 2, name: "Kebab & Grill" }]);
});

test("get_dish for an unknown id or name, or bad arguments, is a plain isError", () => {
  for (const args of [{ id: "nope" }, { name: "Nothing" }, {}, { id: "d1", name: "Omelette" }]) {
    const r = call("get_dish", args);
    assert.equal(r.isError, true, JSON.stringify(args));
    assert.equal(r.content[0].type, "text");
    assert.ok(r.content[0].text.length > 0 && r.content[0].text.length < 100);
  }
  assert.match(call("get_dish", { id: "nope" }).content[0].text, /No dish/);
});

test("get_history returns occurrences in the inclusive range with feedback", () => {
  const r = call("get_history", { from: "2026-11-02", to: "2026-11-03" }).structuredContent;
  assert.deepEqual(r.occurrences.map((o) => o.date), ["2026-11-02", "2026-11-03"]);
  assert.deepEqual(r.occurrences[0].dish, { id: "d1", name: "Omelette" });
  assert.deepEqual(r.occurrences[0].feedback, []);
  assert.equal(r.occurrences[0].modifications, "extra cheese");
  assert.deepEqual(r.occurrences[1].feedback, [
    { member: "Alex", rating: "liked", make_again: "yes", changes: "less salt" },
    { member: "Sam", rating: "okay", make_again: "maybe", changes: null },
  ]);
  const single = call("get_history", { from: "2026-11-05", to: "2026-11-05" }).structuredContent;
  assert.deepEqual(single.occurrences.map((o) => o.dish.name), ["Pasta"]);
});

test("get_history rejects bad dates, reversed ranges and over-long ranges", () => {
  const cases = [
    { from: "2026-13-01", to: "2026-11-03" }, { from: "yesterday", to: "2026-11-03" },
    { from: "2026-11-03", to: "2026-02-30" }, { from: "2026-11-04", to: "2026-11-03" },
    { from: "2026-11-03" }, { from: 5, to: "2026-11-03" },
  ];
  for (const args of cases) {
    const r = call("get_history", args);
    assert.equal(r.isError, true, JSON.stringify(args));
    assert.equal(r.content[0].type, "text");
  }
  assert.equal(call("get_history", { from: "2025-11-02", to: "2026-11-03" }).isError, true);
  assert.equal(call("get_history", { from: "2025-11-03", to: "2026-11-03" }).isError, undefined);
});

test("get_household returns only active members with preference_notes", () => {
  const r = call("get_household", {}).structuredContent;
  assert.deepEqual(r.members, [
    { id: "m1", name: "Alex", preference_notes: "No mushrooms" },
    { id: "m2", name: "Sam", preference_notes: null },
  ]);
});
