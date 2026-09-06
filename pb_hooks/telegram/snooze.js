"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const planning = require(`${__hooks}/meal_planning/service.js`);

// The three durations the issue asks for: "a couple of hours, a day, this
// week". Each callback_data token below must stay short — Telegram allows at
// most 64 bytes and this is combined with the "set:snooze:" prefix.
const DURATIONS = {
  "2h": {
    label: "2 hours",
    until: () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  },
  tomorrow: {
    label: "until tomorrow",
    // 09:00 local the next calendar day — the start of the nudge window.
    until: () => planning.localTimestamp(calendar.addDays(planning.today(), 1), 9, 0),
  },
  week: {
    label: "the rest of the week",
    // 09:00 local on the Monday of the next calendar week, whatever day it
    // is asked from — including Sunday, where "next week" is tomorrow.
    until: () => planning.localTimestamp(calendar.addDays(calendar.weekBounds(planning.today()).start, 7), 9, 0),
  },
};

function tokens() {
  return Object.keys(DURATIONS);
}

function label(token) {
  return DURATIONS[token] ? DURATIONS[token].label : "";
}

function resolve(token) {
  const duration = DURATIONS[token];
  return duration ? duration.until() : null;
}

module.exports = { tokens, label, resolve };
