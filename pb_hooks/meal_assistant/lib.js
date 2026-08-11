"use strict";

const MEALS = ["breakfast", "lunch", "dinner"];
const RATINGS = ["liked", "okay", "disliked"];
const MAKE_AGAIN = ["yes", "maybe", "no"];
const OUTCOMES = ["accepted", "rejected"];
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function parseDate(value) {
  const match = DATE_PATTERN.exec(value || "");
  if (!match) throw badRequest("date must use YYYY-MM-DD format");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw badRequest("date must be a real calendar date");
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
  const mondayFirstIndex = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date.getTime() - mondayFirstIndex * DAY_MS);
  return {
    start: dateKey(monday),
    end: dateKey(new Date(monday.getTime() + 6 * DAY_MS)),
  };
}

// Mirrors app/lib/rotation.ts. January 1, 2024 is the stable week-one Monday.
function dinnerRotation(dateValue) {
  const date = typeof dateValue === "string" ? parseDate(dateValue) : dateValue;
  const bounds = weekBounds(date);
  const monday = parseDate(bounds.start);
  const anchor = Date.UTC(2024, 0, 1);
  const weekOffset = Math.round((monday.getTime() - anchor) / (7 * DAY_MS));
  const rotationWeek = ((weekOffset % 2) + 2) % 2 === 0 ? 1 : 2;
  const day = (date.getUTCDay() + 6) % 7;

  if (day === 5) return { kind: "eat-out", rotationWeek };
  if (day === 6) return { kind: "sunday-choice", rotationWeek, choiceCatIds: [2, 3] };

  const weekOne = [5, 1, 6, 4, 7];
  const weekTwo = [12, 11, 10, 9, 8];
  return {
    kind: "category",
    rotationWeek,
    catId: (rotationWeek === 1 ? weekOne : weekTwo)[day],
  };
}

function assertEnum(value, allowed, field) {
  if (allowed.indexOf(value) === -1) {
    throw badRequest(field + " must be one of: " + allowed.join(", "));
  }
  return value;
}

function assertMeal(value) {
  return assertEnum(value, MEALS, "meal");
}

function nonEmptyString(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(field + " is required");
  }
  const result = value.trim();
  if (maxLength && result.length > maxLength) {
    throw badRequest(field + " is too long");
  }
  return result;
}

module.exports = {
  MEALS,
  RATINGS,
  MAKE_AGAIN,
  OUTCOMES,
  addDays,
  assertEnum,
  assertMeal,
  badRequest,
  dateKey,
  dinnerRotation,
  nonEmptyString,
  parseDate,
  weekBounds,
};
