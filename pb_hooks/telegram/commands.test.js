"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const commands = require("./commands.js");

test("Telegram commands support group bot suffixes and normalized arguments", () => {
  assert.deepEqual(commands.parseCommand("/suggest@family_bot Dinner"), {
    command: "suggest",
    args: ["dinner"],
  });
  assert.equal(commands.mealArgument(["dinner"]), "dinner");
});

test("ordinary text and unknown meal arguments are not interpreted", () => {
  assert.equal(commands.parseCommand("suggest dinner"), null);
  assert.equal(commands.mealArgument(["snack"]), null);
});
