"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
global.__hooks = path.resolve(__dirname, "..");
const dispatcher = require("./dispatcher.js");
const registry = require("./tools/index.js");
const clock = require("./clock.js");
const instructions = require("./instructions.js");

let nextId = 1;
function call(method, params) {
  return dispatcher.handle({ jsonrpc: "2.0", id: nextId++, method, params }, {});
}
function toolCall(name, args) {
  return call("tools/call", { name, arguments: args });
}
function captureLogs(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  try { fn(); } finally { console.log = original; }
  return lines;
}
function withClock(date, time, fn) {
  const original = clock.localNow;
  clock.localNow = () => ({ date, time, timezone: "Europe/Amsterdam" });
  try { return fn(); } finally { clock.localNow = original; }
}

test("initialize echoes a supported protocol version", () => {
  for (const v of ["2025-06-18", "2025-03-26", "2024-11-05"]) {
    assert.equal(call("initialize", { protocolVersion: v }).result.protocolVersion, v);
  }
});

test("initialize with an unsupported version returns the latest implemented", () => {
  assert.equal(call("initialize", { protocolVersion: "1999-01-01" }).result.protocolVersion, "2025-06-18");
  assert.equal(call("initialize", {}).result.protocolVersion, "2025-06-18");
});

test("initialize returns capabilities and serverInfo", () => {
  const r = call("initialize", { protocolVersion: "2025-06-18" }).result;
  assert.deepEqual(r.capabilities, { tools: {} });
  assert.equal(r.serverInfo.name, "meal-planner");
  assert.equal(r.serverInfo.title, "Household Meal Planner");
  assert.ok(r.serverInfo.version);
});

test("instructions are short and cover the planning rules", () => {
  const text = call("initialize", {}).result.instructions;
  assert.equal(text, instructions);
  assert.ok(text.length < 2000);
  for (const re of [/dinners? only/i, /household/i, /YYYY-MM-DD/, /APP_TIMEZONE/, /Monday to Sunday/, /Sunday/, /Saturday is always eating out/i,
    /planned/, /cooked/, /skipped/, /eat_out/, /past dates cannot be changed/i, /get_context/, /get_week/, /preferences/i, /feedback/i]) {
    assert.match(text, re);
  }
});

test("tools/list returns every registered tool with title, description and schema", () => {
  const tools = call("tools/list").result.tools;
  assert.equal(tools.length, registry.length);
  assert.ok(tools.some((t) => t.name === "get_context"));
  for (const t of tools) {
    assert.ok(t.title && t.description);
    assert.equal(t.inputSchema.type, "object");
  }
});

test("every registered tool has title, description, annotations and property descriptions", () => {
  for (const t of registry) {
    assert.ok(t.title && t.title.trim(), t.name);
    assert.ok(t.description && t.description.trim(), t.name);
    assert.ok(t.annotations && typeof t.annotations === "object", t.name);
    assert.equal(typeof t.handler, "function", t.name);
    for (const [prop, def] of Object.entries(t.inputSchema.properties || {})) {
      assert.ok(def.description && def.description.trim(), `${t.name}.${prop}`);
    }
  }
});

const WRITE_TOOLS = ["update_category", "create_category", "upsert_dish", "set_dinner", "set_dinner_status", "clear_dinner", "set_day_category", "set_rotation_day"];
const PLAN_WRITE_TOOLS = ["set_dinner", "set_dinner_status", "clear_dinner", "set_day_category"];
test("only the write tools are not read-only, and all tools are closed-world", () => {
  const listed = call("tools/list").result.tools;
  for (const t of listed) {
    assert.equal(t.annotations.readOnlyHint, !WRITE_TOOLS.includes(t.name), t.name);
    assert.equal(t.annotations.destructiveHint === true, t.name === "clear_dinner", t.name);
    if (PLAN_WRITE_TOOLS.includes(t.name)) assert.equal(t.inputSchema.type, "object");
  }
  assert.equal(listed.filter((t) => PLAN_WRITE_TOOLS.includes(t.name)).length, 4);
  for (const t of registry) {
    assert.equal(t.annotations.openWorldHint, false, t.name);
  }
});

test("tools/call returns text content and structuredContent of the same object", () => {
  const r = withClock("2026-11-04", "12:30", () => toolCall("get_context", {})).result;
  assert.equal(r.isError, undefined);
  assert.equal(r.content.length, 1);
  assert.equal(r.content[0].type, "text");
  assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
});

test("invalid tool params give an isError result, not a protocol error", () => {
  for (const args of [{ bogus: 1 }, "x", []]) {
    const response = toolCall("get_context", args);
    assert.equal(response.error, undefined);
    assert.equal(response.result.isError, true);
    assert.equal(response.result.content[0].type, "text");
  }
});

test("a throwing handler becomes an isError result without leaking details", () => {
  const original = clock.localNow;
  clock.localNow = () => { throw new Error("secret detail"); };
  try {
    const response = toolCall("get_context", {});
    assert.equal(response.result.isError, true);
    assert.equal(JSON.stringify(response).includes("secret"), false);
  } finally { clock.localNow = original; }
});

test("unknown tool returns a JSON-RPC error", () => {
  const response = toolCall("nope", {});
  assert.equal(response.error.code, -32602);
  assert.equal(response.result, undefined);
});

test("each call logs exactly one line without arguments", () => {
  const long = "a".repeat(500);
  const ok = captureLogs(() => withClock("2026-11-04", "12:30", () => toolCall("get_context", {})));
  assert.deepEqual(ok, ["MCP call: get_context -> ok"]);
  const bad = captureLogs(() => toolCall("get_context", { [long]: long }));
  assert.equal(bad.length, 1);
  assert.match(bad[0], /^MCP call: get_context -> error \w+$/);
  assert.ok(bad[0].length < 200);
  const unknown = captureLogs(() => toolCall("nope", { x: long }));
  assert.deepEqual(unknown, ["MCP call: nope -> error -32602"]);
});

test("get_context on a weekday", () => {
  const r = withClock("2026-11-04", "12:30", () => toolCall("get_context", {})).result.structuredContent;
  assert.deepEqual(r, { today: "2026-11-04", timezone: "Europe/Amsterdam", time: "12:30", planningWeekStart: "2026-11-02", rotationWeek: 1, planningWeekRotationWeek: 1 });
});

test("get_context on a Sunday plans the coming week", () => {
  const r = withClock("2026-11-08", "09:05", () => toolCall("get_context", {})).result.structuredContent;
  assert.equal(r.today, "2026-11-08");
  assert.equal(r.planningWeekStart, "2026-11-09");
  assert.equal(r.rotationWeek, 1);
  assert.equal(r.planningWeekRotationWeek, 2);
});
