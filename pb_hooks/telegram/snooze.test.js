"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// service.js's timezone maths runs against PocketBase's DateTime/Timezone
// globals, which only exist inside the real JSVM runtime. These stand-ins
// reproduce the two calls it makes — a naive "date time" string is read as
// that literal instant in UTC, and .time().in(tz).format(layout) renders an
// instant in a target IANA zone — using Node's real (and accurate) tz
// database, so the arithmetic under test is checked against real offsets.
function offsetMinutes(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "shortOffset" }).formatToParts(date);
  const match = /GMT([+-]\d+)(?::(\d+))?/.exec(parts.find((part) => part.type === "timeZoneName").value);
  const hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  return (hours < 0 ? -1 : 1) * (Math.abs(hours) * 60 + minutes);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatInstant(date, timezone, layout) {
  const offset = offsetMinutes(date, timezone);
  const shifted = new Date(date.getTime() + offset * 60 * 1000);
  const offsetStr = (offset >= 0 ? "+" : "-") + pad2(Math.floor(Math.abs(offset) / 60)) + ":" + pad2(Math.abs(offset) % 60);
  const isoDate = shifted.getUTCFullYear() + "-" + pad2(shifted.getUTCMonth() + 1) + "-" + pad2(shifted.getUTCDate());
  if (layout === "-07:00") return offsetStr;
  if (layout === "2006-01-02") return isoDate;
  if (layout === "Mon 15:04") {
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][shifted.getUTCDay()];
    return weekday + " " + pad2(shifted.getUTCHours()) + ":" + pad2(shifted.getUTCMinutes());
  }
  if (layout === "2006-01-02T15:04:05-07:00") {
    return isoDate + "T" + pad2(shifted.getUTCHours()) + ":" + pad2(shifted.getUTCMinutes()) + ":" + pad2(shifted.getUTCSeconds()) + offsetStr;
  }
  throw new Error("unsupported layout in stub: " + layout);
}

global.Timezone = function Timezone(name) { this.name = name; };
global.DateTime = function DateTime(value) {
  const date = value === undefined
    ? new Date(Date.now())
    : new Date(/Z|[+-]\d{2}:\d{2}$/.test(value) ? value : value.replace(" ", "T") + "Z");
  this.time = () => ({
    in: (timezone) => ({ format: (layout) => formatInstant(date, timezone.name, layout) }),
  });
};

let fakeNow = Date.parse("2026-09-06T21:30:00.000Z"); // 23:30 Europe/Amsterdam (CEST, UTC+2)
global.$os = { getenv: (name) => (name === "APP_TIMEZONE" ? "Europe/Amsterdam" : "") };
const RealDateNow = Date.now;
Date.now = () => fakeNow;

global.__hooks = path.resolve(__dirname, "..");
const snooze = require("./snooze.js");

test.after(() => { Date.now = RealDateNow; });

test("2 hours snoozes exactly two hours from now, needing no timezone", () => {
  const until = snooze.resolve("2h");
  assert.equal(new Date(until).getTime() - fakeNow, 2 * 60 * 60 * 1000);
});

test("until tomorrow chosen at 23:30 local resolves to 09:00 the next morning, not the past", () => {
  const until = snooze.resolve("tomorrow");
  // 2026-09-06 23:30 Amsterdam -> 2026-09-07 09:00 Amsterdam is 07:00 UTC.
  assert.equal(until, "2026-09-07T07:00:00.000Z");
  assert.ok(new Date(until).getTime() > fakeNow, "must not resolve to a time already in the past");
  const hoursAhead = (new Date(until).getTime() - fakeNow) / (60 * 60 * 1000);
  assert.ok(hoursAhead > 9 && hoursAhead < 10, "roughly 9.5 hours later, got " + hoursAhead);
});

test("rest of the week resolves to 09:00 the following Monday from a midweek day", () => {
  const until = snooze.resolve("week");
  // 2026-09-06 is a Sunday in this fixture; see the dedicated Sunday case
  // below for that edge. Move the fixture to a midweek day here.
  fakeNow = Date.parse("2026-09-09T10:00:00.000Z"); // Wednesday 2026-09-09, midday Amsterdam
  const midweekUntil = snooze.resolve("week");
  assert.equal(midweekUntil, "2026-09-14T07:00:00.000Z"); // Monday 2026-09-14 09:00 CEST
  assert.notEqual(until, midweekUntil);
});

test("rest of the week chosen on a Sunday resolves to 09:00 the next morning (Monday)", () => {
  fakeNow = Date.parse("2026-09-06T10:00:00.000Z"); // Sunday 2026-09-06, midday Amsterdam
  const until = snooze.resolve("week");
  assert.equal(until, "2026-09-07T07:00:00.000Z"); // Monday 2026-09-07 09:00 CEST
});

test("an unknown duration token resolves to nothing", () => {
  assert.equal(snooze.resolve("nope"), null);
});
