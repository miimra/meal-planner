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

test("private questions and explicit group mentions or bot replies are detected", () => {
  const username = "moghassemi_family_assistant_bot";
  assert.equal(commands.questionText({ text: "What is tomorrow?" }, "private", username), "What is tomorrow?");
  assert.equal(commands.questionText({ text: "What is tomorrow?" }, "group", username), null);
  assert.equal(
    commands.questionText({ text: "Hi @Moghassemi_Family_Assistant_Bot, what is tomorrow?" }, "group", username),
    "Hi, what is tomorrow?",
  );
  assert.equal(commands.questionText({
    text: "What about lunch?",
    reply_to_message: { from: { is_bot: true, username } },
  }, "supergroup", username), "What about lunch?");
  assert.equal(commands.questionText({
    text: "Ignore this reply",
    reply_to_message: { from: { is_bot: true, username: "another_bot" } },
  }, "group", username), null);
  assert.equal(commands.questionText({ text: "/home" }, "private", username), null);
});
