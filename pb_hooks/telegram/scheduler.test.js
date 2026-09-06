"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// scheduler.js runs against PocketBase's app/Record/$os/DateTime/Timezone
// globals and, transitively through bot.js, the live Telegram/OpenRouter
// clients. This harness fakes the database and the clock (both minimal,
// covering only the shapes scheduler.js actually issues) and swaps bot.js
// for a recorder before scheduler.js ever requires it, so the real scheduler
// logic runs unmodified against a deterministic world.
global.__hooks = path.resolve(__dirname, "..");

let now = Date.parse("2026-08-19T10:00:00.000Z"); // a Wednesday, well inside a week
global.$os = { getenv: (name) => (name === "APP_TIMEZONE" ? "Europe/Amsterdam" : "") };
global.Timezone = function Timezone(name) { this.name = name; };
global.DateTime = function DateTime(value) {
  const date = value === undefined ? new Date(now) : new Date(/Z|[+-]\d{2}:\d{2}$/.test(value) ? value : value.replace(" ", "T") + "Z");
  this.time = () => ({ in: () => ({ format: (layout) => {
    // Fixed +02:00 (CEST) offset is enough for this suite's fixture dates.
    const shifted = new Date(date.getTime() + 2 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    if (layout === "2006-01-02") return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
    throw new Error("unsupported layout in stub: " + layout);
  } }) });
};
const RealDateNow = Date.now;
Date.now = () => now;

let idSeq = 0;
function makeCollection(name) { return { name }; }
function makeRecordFrom(collection, seed) {
  const store = Object.assign({ id: "r" + (++idSeq) }, seed);
  return {
    id: store.id,
    getString: (field) => String(store[field] ?? ""),
    getBool: (field) => Boolean(store[field]),
    set: (field, value) => { store[field] = value; },
    _store: store,
  };
}
global.Record = function Record(collection) { return makeRecordFrom(collection, {}); };

function makeApp() {
  const tables = { telegram_chats: [], telegram_delivery_runs: [] };
  return {
    _tables: tables,
    addChat(seed) {
      const record = makeRecordFrom(makeCollection("telegram_chats"), Object.assign({ active: true, daily_enabled: true, snoozed_until: "" }, seed));
      tables.telegram_chats.push(record);
      return record;
    },
    findCollectionByNameOrId: (name) => makeCollection(name),
    save: (record) => {
      record._store.updated = new Date(now).toISOString();
      const table = tables[record._store.__collection || guessTable(record)];
      const list = table || tables.telegram_delivery_runs;
      if (!list.includes(record)) list.push(record);
    },
    findRecordsByFilter(collection, filter) {
      const rows = tables[collection] || [];
      if (collection === "telegram_chats" && filter === "active = true && daily_enabled = true") {
        return rows.filter((row) => row._store.active && row._store.daily_enabled);
      }
      // Every other lookup (meal_assignments, categories, ...) belongs to the
      // planning week's day-by-day rendering, not to snooze/catch-up logic;
      // an empty result leaves every dinner unplanned, i.e. open, which is
      // the only fact this suite needs from that machinery.
      return [];
    },
    logger: () => ({ error() {}, info() {}, debug() {}, warn() {} }),
  };
}
function guessTable(record) {
  return record._store.kind !== undefined ? "telegram_delivery_runs" : "telegram_chats";
}

// claimDelivery/first query telegram_delivery_runs with parameterized filters;
// stub findRecordsByFilter to also understand those two shapes.
function withDeliveryLookups(app) {
  const original = app.findRecordsByFilter.bind(app);
  app.findRecordsByFilter = (collection, filter, sort, limit, offset, params) => {
    if (collection === "telegram_delivery_runs" && filter === "chat = {:chat} && target_date = {:date} && kind = {:kind}") {
      return app._tables.telegram_delivery_runs.filter((row) => (
        row._store.chat === params.chat && row._store.target_date === params.date && row._store.kind === params.kind
      ));
    }
    if (collection === "telegram_delivery_runs" && filter === "kind = 'weekly' && status = 'sent' && target_date >= {:current}") {
      const matches = app._tables.telegram_delivery_runs.filter((row) => (
        row._store.kind === "weekly" && row._store.status === "sent" && row._store.target_date >= params.current
      ));
      matches.sort((a, b) => (a._store.target_date < b._store.target_date ? 1 : -1));
      return matches.slice(0, 1);
    }
    return original(collection, filter, sort, limit, offset, params);
  };
  return app;
}

const botPath = require.resolve(path.join(__dirname, "bot.js"));
const sentWeekly = [];
const sentNudges = [];
require.cache[botPath] = {
  id: botPath,
  filename: botPath,
  loaded: true,
  exports: {
    sendWeeklyPlan: (app, chat, weekStart) => { sentWeekly.push({ chat: chat.id, weekStart }); return { message_id: 1 }; },
    sendNudge: (app, chat, weekStart) => { sentNudges.push({ chat: chat.id, weekStart }); return { message_id: 2 }; },
  },
};

const scheduler = require("./scheduler.js");

test.after(() => { Date.now = RealDateNow; });

test("sendWeekly skips a snoozed chat and leaves no delivery run for it", () => {
  const app = withDeliveryLookups(makeApp());
  const future = new Date(now + 60 * 60 * 1000).toISOString();
  const snoozedChat = app.addChat({ snoozed_until: future });
  sentWeekly.length = 0;

  const result = scheduler.sendWeekly(app);

  assert.equal(sentWeekly.length, 0);
  assert.equal(result.snoozed, 1);
  assert.equal(result.sent, 0);
  assert.equal(app._tables.telegram_delivery_runs.filter((row) => row._store.chat === snoozedChat.id).length, 0);
});

test("sendWeekly behaves exactly as before for an unsnoozed chat", () => {
  const app = withDeliveryLookups(makeApp());
  const chat = app.addChat({});
  sentWeekly.length = 0;

  const result = scheduler.sendWeekly(app);

  assert.equal(result.sent, 1);
  assert.equal(result.snoozed, 0);
  assert.equal(sentWeekly.length, 1);
  assert.equal(sentWeekly[0].chat, chat.id);
  const run = app._tables.telegram_delivery_runs.find((row) => row._store.chat === chat.id);
  assert.equal(run._store.status, "sent");
});

test("an expired or empty snooze does not suppress sendWeekly", () => {
  const app = withDeliveryLookups(makeApp());
  const past = new Date(now - 60 * 60 * 1000).toISOString();
  app.addChat({ snoozed_until: past });
  app.addChat({ snoozed_until: "" });
  sentWeekly.length = 0;

  const result = scheduler.sendWeekly(app);

  assert.equal(result.sent, 2);
  assert.equal(result.snoozed, 0);
});

test("sendNudges skips a snoozed chat once a week has been announced", () => {
  const app = withDeliveryLookups(makeApp());
  const future = new Date(now + 60 * 60 * 1000).toISOString();
  const chat = app.addChat({ snoozed_until: future });
  const weekStart = "2026-08-17";
  const announced = makeRecordFrom(makeCollection("telegram_delivery_runs"), {
    chat: chat.id, target_date: weekStart, kind: "weekly", status: "sent",
    updated: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  });
  app._tables.telegram_delivery_runs.push(announced);
  sentNudges.length = 0;

  const result = scheduler.sendNudges(app);

  assert.equal(sentNudges.length, 0);
  assert.equal(result.snoozed, 1);
  assert.equal(result.sent, 0);
});

test("catch-up: an expired snooze that swallowed the weekly message is caught up by the first nudge tick", () => {
  const app = withDeliveryLookups(makeApp());
  const chat = app.addChat({}); // not snoozed: the snooze already expired
  sentWeekly.length = 0;
  sentNudges.length = 0;

  const first = scheduler.sendNudges(app);
  assert.equal(first.catchUp, true);
  assert.equal(first.sent, 1);
  assert.equal(sentWeekly.length, 1, "the catch-up sends the weekly plan, not a nudge");
  assert.equal(sentNudges.length, 0);
  const run = app._tables.telegram_delivery_runs.find((row) => row._store.chat === chat.id && row._store.kind === "weekly");
  assert.ok(run, "the weekly delivery run is claimed");
  assert.equal(run._store.status, "sent");

  // A second tick right away must not send a second weekly message...
  sentWeekly.length = 0;
  const second = scheduler.sendNudges(app);
  assert.equal(second.skipped, "too_soon", "the normal NUDGE_DELAY_MS gap now applies, same as a real weekly send");
  assert.equal(sentWeekly.length, 0);

  // ...and once that gap has passed, subsequent ticks nudge normally instead
  // of catching up again.
  now += 61 * 60 * 1000;
  const third = scheduler.sendNudges(app);
  assert.equal(third.catchUp, undefined);
  assert.equal(sentNudges.length, 1);
  assert.equal(sentWeekly.length, 0);
});

test("catch-up sends nothing when every dinner in the week is already decided", () => {
  const app = withDeliveryLookups(makeApp());
  app.addChat({});
  const originalWeekValue = require(`${__hooks}/meal_planning/service.js`).weekValue;
  const planning = require(`${__hooks}/meal_planning/service.js`);
  planning.weekValue = () => ({ start: "2026-08-17", end: "2026-08-23", days: [] }); // no actionable days at all
  sentWeekly.length = 0;

  const result = scheduler.sendNudges(app);

  assert.equal(result.skipped, "week_complete");
  assert.equal(sentWeekly.length, 0);
  planning.weekValue = originalWeekValue;
});

test("catch-up never pre-empts the Sunday cron: on Sunday it waits for the 14:00 weekly message", () => {
  const app = withDeliveryLookups(makeApp());
  app.addChat({});
  now = Date.parse("2026-08-23T08:00:00.000Z"); // Sunday, before the weekly cron fires
  sentWeekly.length = 0;

  const result = scheduler.sendNudges(app);

  assert.equal(result.skipped, "no_announced_week");
  assert.equal(sentWeekly.length, 0);
});
