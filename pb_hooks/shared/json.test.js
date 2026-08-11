"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const json = require("./json.js");

function record(value) {
  return { get: () => value };
}

test("JSON array fields decode PocketBase byte arrays including UTF-8", () => {
  const value = ["500 g shrimp", "۱ پیاز"];
  const bytes = Array.from(Buffer.from(JSON.stringify(value), "utf8"));
  assert.deepEqual(json.arrayField(record(bytes), "ingredients"), value);
});

test("JSON array fields preserve decoded arrays and reject invalid values", () => {
  assert.deepEqual(json.arrayField(record(["egg"]), "ingredients"), ["egg"]);
  assert.deepEqual(json.arrayField(record([255]), "ingredients"), []);
  assert.deepEqual(json.arrayField(record(null), "ingredients"), []);
});
