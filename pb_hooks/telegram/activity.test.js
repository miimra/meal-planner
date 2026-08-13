"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const activity = require("./activity.js");

test("Telegram activity identifies a person, group, and message safely", () => {
  const update = { message: { from: { id: 111, first_name: "Amir" }, text: "Hello\nfamily" } };
  assert.equal(activity.person(update), "Amir");
  assert.equal(activity.place({ type: "group", title: "Onze huis" }), "Onze huis");
  assert.equal(activity.content(update), "Hello family");
});

test("Telegram activity describes button labels and resulting actions", () => {
  const query = {
    data: "do:skip:2026-08-14:dinner",
    message: { reply_markup: { inline_keyboard: [[{ text: "⏭ Skip", callback_data: "do:skip:2026-08-14:dinner" }]] } },
  };
  assert.equal(activity.buttonText(query), "⏭ Skip");
  assert.equal(activity.callbackAction(query.data), "skipped 2026-08-14 dinner");
});

test("Telegram activity distinguishes handled and ignored messages", () => {
  const update = { message: { text: "What is tomorrow?" } };
  assert.equal(activity.action(update, true), "answered household question");
  assert.equal(activity.action(update, false), "ignored; no bot action");
});
