"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
global.__hooks = path.resolve(__dirname, "..");
const dispatcher = require("./dispatcher.js");

test("ping returns an empty result object", () => {
  const response = dispatcher.handle({ jsonrpc: "2.0", id: 7, method: "ping" }, {});
  assert.deepEqual(response, { jsonrpc: "2.0", id: 7, result: {} });
});

test("a message without id gets no response (HTTP 202, empty body)", () => {
  assert.deepEqual(dispatcher.handleText('{"jsonrpc":"2.0","method":"notifications/initialized"}', {}), { status: 202 });
  assert.equal(dispatcher.handle({ jsonrpc: "2.0", method: "ping" }, {}), null);
});

test("unknown method returns -32601", () => {
  for (const method of ["nope", "constructor", "__proto__"]) {
    const response = dispatcher.handle({ jsonrpc: "2.0", id: 1, method }, {});
    assert.equal(response.error.code, -32601, method);
    assert.equal(response.id, 1);
  }
});

test("malformed JSON returns -32700 with null id", () => {
  const out = dispatcher.handleText("{not json", {});
  assert.equal(out.status, 200);
  assert.equal(out.body.error.code, -32700);
  assert.equal(out.body.id, null);
});

test("invalid requests return -32600", () => {
  for (const bad of [[], 5, null, { id: 1, method: "ping" }, { jsonrpc: "2.0", id: 1, method: 3 }, { jsonrpc: "2.0", id: {}, method: "ping" }]) {
    assert.equal(dispatcher.handle(bad, {}).error.code, -32600);
  }
});

test("handlers registered in the table are dispatched with params and context", () => {
  const methods = { "tools/list": (params, ctx) => ({ params, ctx }) };
  const response = dispatcher.handle({ jsonrpc: "2.0", id: "a", method: "tools/list", params: { x: 1 } }, { who: "me" }, methods);
  assert.deepEqual(response.result, { params: { x: 1 }, ctx: { who: "me" } });
});

test("handler errors map to JSON-RPC errors without leaking internals", () => {
  const methods = {
    bad: () => { throw new dispatcher.RpcError(-32602, "Invalid params"); },
    boom: () => { throw new Error("secret detail"); },
  };
  assert.equal(dispatcher.handle({ jsonrpc: "2.0", id: 1, method: "bad" }, {}, methods).error.code, -32602);
  const boom = dispatcher.handle({ jsonrpc: "2.0", id: 1, method: "boom" }, {}, methods);
  assert.equal(boom.error.code, -32603);
  assert.equal(JSON.stringify(boom).includes("secret"), false);
});
