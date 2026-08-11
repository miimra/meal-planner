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

module.exports = { MEALS, mealArgument, parseCommand, suggestionPreference };
