"use strict";

// Dinner is the only meal the bot plans. Breakfast and lunch rows written by
// earlier versions stay in the database; nothing reads or writes them now.
const MEALS = ["dinner"];
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value) {
  const match = DATE_PATTERN.exec(String(value || ""));
  if (!match) throw new Error("invalid_date");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("invalid_date");
  }
  return date;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value, count) {
  const date = typeof value === "string" ? parseDate(value) : value;
  return dateKey(new Date(date.getTime() + count * DAY_MS));
}

function weekBounds(value) {
  const date = typeof value === "string" ? parseDate(value) : value;
  const day = (date.getUTCDay() + 6) % 7;
  return { start: addDays(date, -day), end: addDays(date, 6 - day) };
}

function dinnerRotation(value) {
  const date = typeof value === "string" ? parseDate(value) : value;
  const monday = parseDate(weekBounds(date).start);
  const weekOffset = Math.round((monday.getTime() - Date.UTC(2024, 0, 1)) / (7 * DAY_MS));
  const rotationWeek = ((weekOffset % 2) + 2) % 2 === 0 ? 1 : 2;
  const day = (date.getUTCDay() + 6) % 7;
  if (day === 5) return { kind: "eat_out", rotationWeek };
  // Monday → Sunday, Saturday skipped; see docs/meal-categories.md.
  const weekOne = [12, 10, 7, 6, 2, null, 3];
  const weekTwo = [5, 11, 8, 9, 4, null, 1];
  return { kind: "category", rotationWeek, catId: (rotationWeek === 1 ? weekOne : weekTwo)[day] };
}

function assertMeal(value) {
  if (MEALS.indexOf(value) === -1) throw new Error("invalid_meal");
  return value;
}

function servingProfile(value, meal) {
  parseDate(typeof value === "string" ? value : dateKey(value));
  assertMeal(meal);
  return { adults: 2, babies: 1, includesBaby: true, label: "2 adults + 1 baby" };
}

// Sunday's message plans the week that starts the next morning; every other
// day the open week is simply the one we are standing in.
function planningWeekStart(value) {
  const date = typeof value === "string" ? parseDate(value) : value;
  const isSunday = date.getUTCDay() === 0;
  return weekBounds(isSunday ? addDays(date, 1) : date).start;
}

function weekDates(start) {
  const dates = [];
  for (let i = 0; i < 7; i += 1) dates.push(addDays(start, i));
  return dates;
}

module.exports = { MEALS, addDays, assertMeal, dateKey, dinnerRotation, parseDate, planningWeekStart, servingProfile, weekBounds, weekDates };
