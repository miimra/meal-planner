"use strict";

function config() {
  const token = String($os.getenv("TELEGRAM_BOT_TOKEN") || "").trim();
  if (!token) throw new Error("telegram_not_configured");
  return {
    token,
    apiBase: String($os.getenv("TELEGRAM_API_BASE_URL") || "https://api.telegram.org").replace(/\/+$/, ""),
  };
}

function request(method, payload) {
  const cfg = config();
  const result = $http.send({
    method: "POST",
    url: cfg.apiBase + "/bot" + cfg.token + "/" + method,
    timeout: 30,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  if (result.statusCode === 400 && result.json && /message is not modified/i.test(String(result.json.description || ""))) {
    return { message_id: payload && payload.message_id };
  }
  if (result.statusCode < 200 || result.statusCode >= 300 || !result.json || result.json.ok !== true) {
    throw new Error("telegram_" + method.toLowerCase() + "_failed");
  }
  return result.json.result;
}

function multipartRequest(method, fields, attachmentName, file) {
  const cfg = config();
  const form = new FormData();
  for (const key of Object.keys(fields || {})) {
    const value = fields[key];
    form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  form.append(attachmentName, file);
  const result = $http.send({
    method: "POST",
    url: cfg.apiBase + "/bot" + cfg.token + "/" + method,
    timeout: 60,
    body: form,
  });
  if (result.statusCode < 200 || result.statusCode >= 300 || !result.json || result.json.ok !== true) {
    throw new Error("telegram_" + method.toLowerCase() + "_failed");
  }
  return result.json.result;
}

function sendMessage(chatId, text, replyMarkup, replyToMessageId) {
  const body = { chat_id: String(chatId), text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  if (replyToMessageId) body.reply_parameters = { message_id: Number(replyToMessageId) };
  return request("sendMessage", body);
}

function editMessageText(chatId, messageId, value, replyMarkup) {
  const body = {
    chat_id: String(chatId),
    message_id: Number(messageId),
    text: value,
    parse_mode: "HTML",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return request("editMessageText", body);
}

function editMessageCaption(chatId, messageId, caption, replyMarkup) {
  return request("editMessageCaption", {
    chat_id: String(chatId),
    message_id: Number(messageId),
    caption,
    parse_mode: "HTML",
    reply_markup: replyMarkup || { inline_keyboard: [] },
  });
}

function editMessageMedia(chatId, messageId, photo, caption, replyMarkup) {
  const media = { type: "photo", media: typeof photo === "string" ? photo : "attach://suggestion", caption, parse_mode: "HTML" };
  const fields = {
    chat_id: String(chatId),
    message_id: Number(messageId),
    media,
    reply_markup: replyMarkup || { inline_keyboard: [] },
  };
  if (typeof photo === "string") return request("editMessageMedia", fields);
  return multipartRequest("editMessageMedia", fields, "suggestion", photo);
}

function richParagraphs(value) {
  return String(value || "").split(/\n\s*\n/).map((paragraph) => (
    "<p>" + paragraph.replace(/\n/g, " ") + "</p>"
  )).join("");
}

function editMessageRichPhoto(chatId, messageId, photo, text, replyMarkup) {
  const media = {
    id: "suggestion",
    media: { type: "photo", media: typeof photo === "string" ? photo : "attach://suggestion" },
  };
  const fields = {
    chat_id: String(chatId),
    message_id: Number(messageId),
    rich_message: {
      html: '<img src="tg://photo?id=suggestion"/>' + richParagraphs(text),
      media: [media],
    },
    reply_markup: replyMarkup || { inline_keyboard: [] },
  };
  if (typeof photo === "string") return request("editMessageText", fields);
  return multipartRequest("editMessageText", fields, "suggestion", photo);
}

function pinChatMessage(chatId, messageId, silent) {
  return request("pinChatMessage", {
    chat_id: String(chatId),
    message_id: Number(messageId),
    disable_notification: silent !== false,
  });
}

function unpinChatMessage(chatId, messageId) {
  return request("unpinChatMessage", {
    chat_id: String(chatId),
    message_id: Number(messageId),
  });
}

function answerCallback(id, text, alert) {
  return request("answerCallbackQuery", {
    callback_query_id: String(id),
    text: text || "",
    show_alert: Boolean(alert),
  });
}

function setCommands(commands) {
  return request("setMyCommands", { commands });
}

function downloadPhoto(fileId, uniqueId) {
  const cfg = config();
  const info = request("getFile", { file_id: fileId });
  if (!info || !info.file_path) throw new Error("telegram_photo_missing");
  if (info.file_size && info.file_size > 10 * 1024 * 1024) throw new Error("telegram_photo_too_large");
  const result = $http.send({
    method: "GET",
    url: cfg.apiBase + "/file/bot" + cfg.token + "/" + info.file_path,
    timeout: 45,
  });
  if (result.statusCode < 200 || result.statusCode >= 300) throw new Error("telegram_photo_download_failed");
  if (!result.body || result.body.length > 10 * 1024 * 1024) throw new Error("telegram_photo_too_large");
  const safeName = String(uniqueId || "meal").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "meal";
  return $filesystem.fileFromBytes(result.body, "telegram-" + safeName + ".jpg");
}

module.exports = {
  answerCallback,
  config,
  downloadPhoto,
  editMessageCaption,
  editMessageMedia,
  editMessageRichPhoto,
  editMessageText,
  pinChatMessage,
  request,
  sendMessage,
  setCommands,
  unpinChatMessage,
};
