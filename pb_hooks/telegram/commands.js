"use strict";

const MEALS = ["breakfast", "lunch", "dinner"];

function parseCommand(text) {
  if (typeof text !== "string" || text.charAt(0) !== "/") return null;
  const parts = text.trim().split(/\s+/);
  const command = parts.shift().slice(1).split("@")[0].toLowerCase();
  const args = parts.map((value) => value.toLowerCase());
  return { command, args };
}

function mealArgument(args) {
  if (!args || !args.length) return null;
  return MEALS.indexOf(args[0]) === -1 ? null : args[0];
}

module.exports = { MEALS, mealArgument, parseCommand };
