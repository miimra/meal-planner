"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const planning = require(`${__hooks}/meal_planning/service.js`);
const bot = require(`${__hooks}/telegram/bot.js`);

function first(app, collection, filter, params) {
  const records = app.findRecordsByFilter(collection, filter, "", 1, 0, params || {});
  return records.length ? records[0] : null;
}

function safeCode(error) {
  const value = String(error && error.message || "internal_error").toLowerCase();
  const normalized = value.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
  return normalized || "internal_error";
}

function claimDelivery(app, chat, targetDate) {
  let delivery = first(app, "telegram_delivery_runs", "chat = {:chat} && target_date = {:date} && kind = 'daily'", { chat: chat.id, date: targetDate });
  if (delivery && delivery.getString("status") === "sent") return null;
  if (delivery && delivery.getString("status") === "processing") {
    const updated = new Date(delivery.getString("updated")).getTime();
    if (Number.isFinite(updated) && Date.now() - updated < 5 * 60 * 1000) return null;
  }
  if (!delivery) delivery = new Record(app.findCollectionByNameOrId("telegram_delivery_runs"));
  delivery.set("chat", chat.id);
  delivery.set("target_date", targetDate);
  delivery.set("kind", "daily");
  delivery.set("status", "processing");
  delivery.set("error_code", "");
  app.save(delivery);
  return delivery;
}

function sendDaily(app) {
  const chats = app.findRecordsByFilter("telegram_chats", "active = true && daily_enabled = true", "created", 0, 0);
  const target = calendar.addDays(planning.today(), 1);
  let sent = 0;
  for (const chat of chats) {
    const delivery = claimDelivery(app, chat, target);
    if (!delivery) continue;
    try {
      const result = bot.sendHome(app, chat);
      delivery.set("message_ids", result && result.message_id ? [String(result.message_id)] : []);
      delivery.set("status", "sent");
      app.save(delivery);
      sent += 1;
    } catch (error) {
      delivery.set("status", "failed");
      delivery.set("error_code", safeCode(error));
      app.save(delivery);
      app.logger().error("Telegram daily dashboard failed", "chat_record", chat.id, "error_code", safeCode(error));
    }
  }
  return { chats: chats.length, sent, targetDate: target };
}

module.exports = { sendDaily };
