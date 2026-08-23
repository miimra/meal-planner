"use strict";

function senderId(update) {
  const source = update && update.callback_query ? update.callback_query : update && update.message;
  return source && source.from && typeof source.from.id !== "undefined" ? String(source.from.id) : "";
}

function chatFromUpdate(update) {
  if (update && update.callback_query && update.callback_query.message) return update.callback_query.message.chat || null;
  return update && update.message ? update.message.chat || null : null;
}

function updateKind(update) {
  if (update && update.callback_query) return "callback_query";
  if (update && update.message && Array.isArray(update.message.photo) && update.message.photo.length) return "photo";
  if (update && update.message && typeof update.message.text === "string") return "message";
  return "unsupported";
}

module.exports = { chatFromUpdate, senderId, updateKind };
