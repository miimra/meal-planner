"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const planning = require(`${__hooks}/meal_planning/service.js`);
const views = require(`${__hooks}/telegram/views.js`);
const bot = require(`${__hooks}/telegram/bot.js`);
const state = require(`${__hooks}/telegram/state.js`);
const json = require(`${__hooks}/shared/json.js`);

const NUDGE_DELAY_MS = 60 * 60 * 1000;

function first(app, collection, filter, params, sort) {
  const records = app.findRecordsByFilter(collection, filter, sort || "", 1, 0, params || {});
  return records.length ? records[0] : null;
}

function safeCode(error) {
  const value = String(error && error.message || "internal_error").toLowerCase();
  const normalized = value.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
  return normalized || "internal_error";
}

function activeChats(app) {
  return app.findRecordsByFilter("telegram_chats", "active = true && daily_enabled = true", "created", 0, 0);
}

function claimDelivery(app, chat, targetDate, kind) {
  let delivery = first(app, "telegram_delivery_runs", "chat = {:chat} && target_date = {:date} && kind = {:kind}", { chat: chat.id, date: targetDate, kind });
  if (delivery && delivery.getString("status") === "sent") return null;
  if (delivery && delivery.getString("status") === "processing") {
    const updated = new Date(delivery.getString("updated")).getTime();
    if (Number.isFinite(updated) && Date.now() - updated < 5 * 60 * 1000) return null;
  }
  if (!delivery) delivery = new Record(app.findCollectionByNameOrId("telegram_delivery_runs"));
  delivery.set("chat", chat.id);
  delivery.set("target_date", targetDate);
  delivery.set("kind", kind);
  delivery.set("status", "processing");
  delivery.set("error_code", "");
  app.save(delivery);
  return delivery;
}

function deliver(app, chat, delivery, send, label) {
  try {
    const result = send();
    delivery.set("message_ids", result && result.message_id ? [String(result.message_id)] : []);
    delivery.set("status", "sent");
    app.save(delivery);
    return true;
  } catch (error) {
    delivery.set("status", "failed");
    delivery.set("error_code", safeCode(error));
    app.save(delivery);
    app.logger().error(label, "chat_record", chat.id, "error_code", safeCode(error));
    return false;
  }
}

/** Sunday's message: the coming Monday-to-Sunday, dinners only. */
function sendWeekly(app) {
  const chats = activeChats(app);
  const weekStart = calendar.planningWeekStart(planning.today());
  let sent = 0;
  let snoozed = 0;
  for (const chat of chats) {
    if (state.isSnoozed(chat)) { snoozed += 1; continue; }
    const delivery = claimDelivery(app, chat, weekStart, "weekly");
    if (!delivery) continue;
    if (deliver(app, chat, delivery, () => bot.sendWeeklyPlan(app, chat, weekStart), "Telegram weekly plan failed")) sent += 1;
  }
  finalizeWeek(app, weekStart);
  return { chats: chats.length, sent, weekStart, snoozed };
}

// Once a week's dinners are all decided, its weekly-plan message is pinned
// with its buttons removed instead of staying a live, editable panel. Each
// chat is finalized independently and only once (a delivery run already
// marked "pinned" is left alone), so a snoozed chat is skipped for now and
// picked up once it resumes, and one chat's pin never touches another's.
function finalizeWeek(app, weekStart) {
  const open = views.actionableDinners(planning.weekValue(app, weekStart), planning.today());
  if (open.length) return { pinned: 0 };

  const chats = activeChats(app);
  let pinned = 0;
  for (const chat of chats) {
    if (state.isSnoozed(chat)) continue;
    const delivery = first(
      app,
      "telegram_delivery_runs",
      "chat = {:chat} && target_date = {:date} && kind = 'weekly' && status = 'sent'",
      { chat: chat.id, date: weekStart },
    );
    if (!delivery || delivery.getBool("pinned")) continue;
    const messageIds = json.arrayField(delivery, "message_ids");
    if (!messageIds.length) continue;
    try {
      bot.pinWeeklyPlan(app, chat, weekStart, messageIds[0]);
      delivery.set("pinned", true);
      app.save(delivery);
      pinned += 1;
    } catch (error) {
      app.logger().error("Telegram weekly plan pin failed", "chat_record", chat.id, "error_code", safeCode(error));
    }
  }
  return { pinned };
}

// A cross-Sunday snooze leaves no "weekly" delivery run for the week it swallowed,
// which is otherwise a dead end: sendNudges below never speaks for a week nothing
// announced. Once the snooze has expired, the first nudge tick catches the
// household up by sending the weekly plan itself and claiming that delivery run,
// exactly as the Sunday cron would have. It never fires for a week that has not
// started yet, so it can never race the Sunday cron itself.
function catchUpWeekly(app, weekStart) {
  const open = views.actionableDinners(planning.weekValue(app, weekStart), planning.today());
  if (!open.length) return { skipped: "week_complete", weekStart };

  const chats = activeChats(app);
  let sent = 0;
  let snoozed = 0;
  for (const chat of chats) {
    if (state.isSnoozed(chat)) { snoozed += 1; continue; }
    const delivery = claimDelivery(app, chat, weekStart, "weekly");
    if (!delivery) continue;
    if (deliver(app, chat, delivery, () => bot.sendWeeklyPlan(app, chat, weekStart), "Telegram weekly plan catch-up failed")) sent += 1;
  }
  return { chats: chats.length, sent, weekStart, open: open.length, snoozed, catchUp: true };
}

/**
 * Hourly follow-up while dinners are still open. It only speaks for a week the
 * weekly message already announced, and only once that message is an hour old,
 * so the first nudge lands at 15:00 on Sunday rather than at 09:00.
 */
function sendNudges(app) {
  const currentWeek = calendar.weekBounds(planning.today()).start;
  const announced = first(
    app,
    "telegram_delivery_runs",
    "kind = 'weekly' && status = 'sent' && target_date >= {:current}",
    { current: currentWeek },
    "-target_date",
  );

  if (!announced) {
    const weekStart = calendar.planningWeekStart(planning.today());
    if (weekStart > planning.today()) return { skipped: "no_announced_week" };
    return catchUpWeekly(app, weekStart);
  }

  const announcedAt = new Date(announced.getString("updated")).getTime();
  if (!Number.isFinite(announcedAt) || Date.now() - announcedAt < NUDGE_DELAY_MS) {
    return { skipped: "too_soon" };
  }

  const weekStart = announced.getString("target_date");
  const open = views.actionableDinners(planning.weekValue(app, weekStart), planning.today());
  if (!open.length) {
    finalizeWeek(app, weekStart);
    return { skipped: "week_complete", weekStart };
  }

  const chats = activeChats(app);
  let sent = 0;
  let snoozed = 0;
  for (const chat of chats) {
    if (state.isSnoozed(chat)) { snoozed += 1; continue; }
    try {
      bot.sendNudge(app, chat, weekStart);
      sent += 1;
    } catch (error) {
      app.logger().error("Telegram plan nudge failed", "chat_record", chat.id, "error_code", safeCode(error));
    }
  }
  return { chats: chats.length, sent, weekStart, open: open.length, snoozed };
}

module.exports = { finalizeWeek, sendNudges, sendWeekly };
