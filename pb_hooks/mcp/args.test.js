"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { requireDate, validateArgs } = require("./args.js");

test("requireDate accepts real dates and rejects others", () => {
  assert.equal(requireDate("2026-02-28"), "2026-02-28");
  for (const bad of ["2026-02-30", "26-01-01", "2026/01/01", "", null, 5]) {
    assert.throws(() => requireDate(bad, "date"), { name: "ToolError" });
  }
});

test("validateArgs checks required, unknown, type and enum", () => {
  const schema = { type: "object", required: ["a"], properties: { a: { type: "string" }, b: { enum: ["x"] } } };
  assert.deepEqual(validateArgs(schema, { a: "1" }), { a: "1" });
  for (const bad of [{}, { a: 1 }, { a: "1", c: 1 }, { a: "1", b: "y" }]) {
    assert.throws(() => validateArgs(schema, bad), { name: "ToolError" });
  }
});
