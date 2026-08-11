"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const commands = require("./commands.js");

test("Telegram commands support group bot suffixes and normalized arguments", () => {
  assert.deepEqual(commands.parseCommand("/suggest@family_bot Dinner"), {
    command: "suggest",
    args: ["dinner"],
    rawArgs: ["Dinner"],
  });
  assert.equal(commands.mealArgument(["dinner"]), "dinner");
});

test("suggestion preferences preserve the user's wording after the meal", () => {
  const parsed = commands.parseCommand("/suggest dinner very easy Sea Food");
  assert.equal(commands.suggestionPreference(parsed), "very easy Sea Food");
  assert.equal(commands.suggestionPreference(commands.parseCommand("/suggest dinner")), null);
  assert.equal(commands.suggestionPreference(commands.parseCommand("/suggest meat")), null);
});

test("ordinary text and unknown meal arguments are not interpreted", () => {
  assert.equal(commands.parseCommand("suggest dinner"), null);
  assert.equal(commands.mealArgument(["snack"]), null);
});
