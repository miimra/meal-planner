"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const security = require("./security.js");

test("sender and chat are resolved for private/group messages", () => {
  const update = { message: { from: { id: 123 }, chat: { id: -456, type: "group" }, text: "/today" } };
  assert.equal(security.senderId(update), "123");
  assert.equal(security.chatFromUpdate(update).id, -456);
  assert.equal(security.updateKind(update), "message");
});

test("callback sender authorization is based on callback from.id", () => {
  const update = { callback_query: { from: { id: 789 }, message: { chat: { id: -456 } } } };
  assert.equal(security.senderId(update), "789");
  assert.equal(security.updateKind(update), "callback_query");
});

test("photos are distinguished from command messages", () => {
  assert.equal(security.updateKind({ message: { photo: [{ file_id: "x" }] } }), "photo");
});
