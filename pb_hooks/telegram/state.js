"use strict";

const planning = require(`${__hooks}/meal_planning/service.js`);

function first(app, collection, filter, params) {
  const records = app.findRecordsByFilter(collection, filter, "", 1, 0, params || {});
  return records.length ? records[0] : null;
}

function authorizedUser(app, telegramUserId) {
  return first(
    app,
    "telegram_users",
    "telegram_user_id = {:id} && active = true",
    { id: String(telegramUserId) },
  );
}

function chatTitle(chat) {
  return String(chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || "").slice(0, 300);
}

function ensureChat(app, chat, user) {
  const id = String(chat.id);
  let record = first(app, "telegram_chats", "chat_id = {:id}", { id });
  if (!record) {
    record = new Record(app.findCollectionByNameOrId("telegram_chats"));
    record.set("chat_id", id);
    record.set("daily_enabled", false);
  }
  const type = ["private", "group", "supergroup"].indexOf(chat.type) === -1 ? "private" : chat.type;
  record.set("type", type);
  record.set("title", chatTitle(chat));
  record.set("active", true);
  record.set("registered_by", user.id);
  record.set("last_seen_at", planning.isoNow());
  app.save(record);
  return record;
}

function subscribe(app, chatRecord, enabled) {
  if (!enabled) {
    chatRecord.set("daily_enabled", false);
    chatRecord.set("active", true);
    app.save(chatRecord);
    return chatRecord;
  }
  app.runInTransaction((tx) => {
    const chats = tx.findRecordsByFilter("telegram_chats", "daily_enabled = true", "", 0, 0);
    for (const chat of chats) {
      if (chat.id === chatRecord.id) continue;
      chat.set("daily_enabled", false);
      tx.save(chat);
    }
    const current = tx.findRecordById("telegram_chats", chatRecord.id);
    current.set("daily_enabled", true);
    current.set("active", true);
    tx.save(current);
  });
  return app.findRecordById("telegram_chats", chatRecord.id);
}

function setConversation(app, user, chat, occurrence, messageId) {
  let record = first(
    app,
    "telegram_conversations",
    "telegram_user = {:user} && chat = {:chat}",
    { user: user.id, chat: chat.id },
  );
  if (!record) record = new Record(app.findCollectionByNameOrId("telegram_conversations"));
  record.set("telegram_user", user.id);
  record.set("chat", chat.id);
  record.set("state", "feedback_photo");
  record.set("occurrence", occurrence.id);
  record.set("message_id", messageId ? String(messageId) : "");
  record.set("expires_at", new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString());
  app.save(record);
  return record;
}

function activeConversation(app, user, chat) {
  const record = first(
    app,
    "telegram_conversations",
    "telegram_user = {:user} && chat = {:chat}",
    { user: user.id, chat: chat.id },
  );
  if (!record || new Date(record.getString("expires_at")).getTime() <= Date.now()) return null;
  return record;
}

function clearConversation(app, user, chat) {
  const record = first(
    app,
    "telegram_conversations",
    "telegram_user = {:user} && chat = {:chat}",
    { user: user.id, chat: chat.id },
  );
  if (record) app.delete(record);
}

module.exports = {
  activeConversation,
  authorizedUser,
  clearConversation,
  ensureChat,
  setConversation,
  subscribe,
};
