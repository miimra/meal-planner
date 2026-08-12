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
  if (result.statusCode < 200 || result.statusCode >= 300 || !result.json || result.json.ok !== true) {
    throw new Error("telegram_" + method.toLowerCase() + "_failed");
  }
  return result.json.result;
}

function sendMessage(chatId, text, replyMarkup) {
  const body = { chat_id: String(chatId), text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
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

module.exports = { answerCallback, config, downloadPhoto, editMessageText, request, sendMessage, setCommands };
