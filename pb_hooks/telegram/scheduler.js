"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const planning = require(`${__hooks}/meal_planning/service.js`);
const bot = require(`${__hooks}/telegram/bot.js`);
const client = require(`${__hooks}/telegram/client.js`);

function first(app, collection, filter, params) {
  const records = app.findRecordsByFilter(collection, filter, "", 1, 0, params || {});
  return records.length ? records[0] : null;
}

function safeCode(error) {
  const value = String(error && error.message || "internal_error").toLowerCase();
  return /^[a-z0-9_]{1,120}$/.test(value) ? value : "internal_error";
}

function claimDelivery(app, chat, targetDate) {
  let delivery = first(
    app,
    "telegram_delivery_runs",
    "chat = {:chat} && target_date = {:date} && kind = 'daily'",
    { chat: chat.id, date: targetDate },
  );
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
  if (!chats.length) return { chats: 0, sent: 0 };
  const today = planning.today();
  const target = calendar.addDays(today, 1);
  const pending = [];
  for (const chat of chats) {
    const delivery = claimDelivery(app, chat, target);
    if (delivery) pending.push({ chat, delivery });
  }
  if (!pending.length) return { chats: chats.length, sent: 0, targetDate: target };

  let suggestions = [];
  let suggestionError = null;
  try {
    suggestions = planning.generateSuggestions(app, target, calendar.MEALS);
  } catch (error) {
    suggestionError = error;
    app.logger().error("Telegram meal suggestions failed", "date", target, "error_code", safeCode(error));
  }

  let sent = 0;
  for (const item of pending) {
    const chat = item.chat;
    const delivery = item.delivery;
    const messageIds = [];
    try {
      for (const meal of calendar.MEALS) {
        const result = bot.sendFeedbackPrompt(app, chat, today, meal);
        if (result && result.message_id) messageIds.push(String(result.message_id));
      }
      if (suggestionError) {
        const result = client.sendMessage(chat.getString("chat_id"), "I couldn’t generate tomorrow’s suggestions. Use /suggest to retry.");
        if (result && result.message_id) messageIds.push(String(result.message_id));
      } else {
        for (const suggestion of suggestions) {
          const result = bot.sendSuggestion(app, chat, suggestion);
          if (result && result.message_id) messageIds.push(String(result.message_id));
        }
      }
      delivery.set("message_ids", messageIds);
      delivery.set("status", "sent");
      app.save(delivery);
      sent += 1;
    } catch (error) {
      delivery.set("message_ids", messageIds);
      delivery.set("status", "failed");
      delivery.set("error_code", safeCode(error));
      app.save(delivery);
      app.logger().error("Telegram daily delivery failed", "chat_record", chat.id, "error_code", safeCode(error));
    }
  }
  return { chats: chats.length, sent, targetDate: target };
}

module.exports = { sendDaily };
