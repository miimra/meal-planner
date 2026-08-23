"use strict";

const MEALS = ["breakfast", "lunch", "dinner"];

function parseCommand(text) {
  if (typeof text !== "string" || text.charAt(0) !== "/") return null;
  const parts = text.trim().split(/\s+/);
  const command = parts.shift().slice(1).split("@")[0].toLowerCase();
  const rawArgs = parts.slice();
  const args = parts.map((value) => value.toLowerCase());
  return { command, args, rawArgs };
}

function mealArgument(args) {
  if (!args || !args.length) return null;
  return MEALS.indexOf(args[0]) === -1 ? null : args[0];
}

function suggestionPreference(parsed) {
  if (!parsed || !mealArgument(parsed.args)) return null;
  const value = (parsed.rawArgs || parsed.args || []).slice(1).join(" ").trim();
  return value ? value.slice(0, 200) : null;
}

function botUsername() {
  return String(typeof $os !== "undefined" && $os.getenv("TELEGRAM_BOT_USERNAME") || "moghassemi_family_assistant_bot")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
}

function replyTargetsBot(message, username) {
  const sender = message && message.reply_to_message && message.reply_to_message.from;
  if (!sender || !sender.is_bot) return false;
  const expected = String(username || botUsername()).replace(/^@/, "").toLowerCase();
  return !sender.username || String(sender.username).toLowerCase() === expected;
}

function mentionedText(message, username) {
  const text = String(message && message.text || "");
  const expected = String(username || botUsername()).replace(/^@/, "");
  const pattern = new RegExp("@" + expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "ig");
  if (!pattern.test(text)) return null;
  return text.replace(pattern, " ").replace(/\s+/g, " ").replace(/\s+([,!?])/g, "$1").trim();
}

function questionText(message, chatType, username) {
  const text = String(message && message.text || "").trim();
  if (!text || text.charAt(0) === "/") return null;
  if (chatType === "private") return text;
  const mentioned = mentionedText(message, username);
  if (mentioned !== null) return mentioned;
  return replyTargetsBot(message, username) ? text : null;
}

module.exports = {
  MEALS,
  botUsername,
  mealArgument,
  mentionedText,
  parseCommand,
  questionText,
  replyTargetsBot,
  suggestionPreference,
};
