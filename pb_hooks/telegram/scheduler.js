"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const planning = require(`${__hooks}/meal_planning/service.js`);
const views = require(`${__hooks}/telegram/views.js`);
const bot = require(`${__hooks}/telegram/bot.js`);

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
  for (const chat of chats) {
    const delivery = claimDelivery(app, chat, weekStart, "weekly");
    if (!delivery) continue;
    if (deliver(app, chat, delivery, () => bot.sendWeeklyPlan(app, chat, weekStart), "Telegram weekly plan failed")) sent += 1;
  }
  return { chats: chats.length, sent, weekStart };
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
  if (!announced) return { skipped: "no_announced_week" };

  const announcedAt = new Date(announced.getString("updated")).getTime();
  if (!Number.isFinite(announcedAt) || Date.now() - announcedAt < NUDGE_DELAY_MS) {
    return { skipped: "too_soon" };
  }

  const weekStart = announced.getString("target_date");
  const open = views.actionableDinners(planning.weekValue(app, weekStart), planning.today());
  if (!open.length) return { skipped: "week_complete", weekStart };

  const chats = activeChats(app);
  let sent = 0;
  for (const chat of chats) {
    try {
      bot.sendNudge(app, chat, weekStart);
      sent += 1;
    } catch (error) {
      app.logger().error("Telegram plan nudge failed", "chat_record", chat.id, "error_code", safeCode(error));
    }
  }
  return { chats: chats.length, sent, weekStart, open: open.length };
}

module.exports = { sendNudges, sendWeekly };
