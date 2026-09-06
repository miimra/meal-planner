"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

global.__hooks = path.resolve(__dirname, "..");
const state = require("./state.js");

function chatWith(snoozedUntil) {
  return { getString: (name) => (name === "snoozed_until" ? String(snoozedUntil || "") : "") };
}

test("a chat is snoozed only while snoozed_until is a strictly future timestamp", () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  assert.equal(state.isSnoozed(chatWith(future)), true);
  assert.equal(state.isSnoozed(chatWith(past)), false);
  assert.equal(state.isSnoozed(chatWith("")), false);
  assert.equal(state.isSnoozed(chatWith("not a date")), false);
});
