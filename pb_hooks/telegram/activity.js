"use strict";

function clean(value, limit) {
  const normalized = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const max = Number(limit || 2000);
  return normalized.length > max ? normalized.slice(0, max - 1) + "…" : normalized;
}

function source(update) {
  return update && update.callback_query ? update.callback_query : update && update.message;
}

function person(update) {
  const from = source(update) && source(update).from || {};
  const name = clean([from.first_name, from.last_name].filter(Boolean).join(" "), 160);
  if (name) return name;
  if (from.username) return "@" + clean(from.username, 150).replace(/^@/, "");
  return typeof from.id === "undefined" ? "Unknown person" : "Telegram user " + String(from.id);
}

function place(chat) {
  if (!chat || chat.type === "private") return "private chat";
  return clean(chat.title, 300) || "group chat";
}

function buttonText(query) {
  const rows = query && query.message && query.message.reply_markup && query.message.reply_markup.inline_keyboard;
  for (const row of rows || []) {
    for (const button of row || []) {
      if (String(button.callback_data || "") === String(query.data || "")) return clean(button.text, 300);
    }
  }
  return "button " + clean(query && query.data, 500);
}

function content(update) {
  if (update && update.callback_query) return buttonText(update.callback_query);
  const message = update && update.message || {};
  if (Array.isArray(message.photo) && message.photo.length) {
    const caption = clean(message.caption, 1800);
    return caption ? "[photo] " + caption : "[photo]";
  }
  return clean(message.text, 2000) || "[unsupported message]";
}

function callbackAction(data) {
  const parts = String(data || "").split(":");
  if (parts[0] === "nav") return "opened " + clean(parts[1] || "navigation", 80);
  if (parts[0] === "set" && parts[1] === "daily") return "turned daily dashboard " + (parts[2] === "on" ? "on" : "off");
  if (parts[0] === "pick" && parts[1] === "date") return "selected date " + clean(parts[2], 20);
  if (parts[0] === "pick" && parts[1] === "meal") return "selected " + clean(parts[2] + " " + parts[3], 80);
  if (parts[0] === "do") {
    const labels = { suggest: "generated a suggestion for", last: "planned the last meal for", buy: "set buy food for", out: "set eat out for", skip: "skipped" };
    return (labels[parts[1]] || "updated") + " " + clean(parts[2] + " " + parts[3], 80);
  }
  if (parts[0] === "sg") {
    const labels = { use: "accepted meal suggestion", next: "generated another meal suggestion", details: "opened suggestion details", card: "returned to suggestion" };
    return labels[parts[1]] || "used suggestion action";
  }
  if (parts[0] === "fb" && parts[1] === "date") return "opened feedback for " + clean(parts[2], 20);
  if (parts[0] === "fb" && parts[1] === "meal") return "selected feedback meal " + clean(parts[2] + " " + parts[3], 80);
  if (parts[0] === "fa") return "saved " + clean(parts[1], 30) + " meal feedback";
  if (parts[0] === "ri") {
    const labels = { view: "opened recipe preview", cats: "opened recipe categories", details: "opened recipe details", cat: "selected recipe category", save: "saved recipe to want to try", cancel: "cancelled recipe import", retry: "retried recipe import" };
    return labels[parts[1]] || "used recipe import action";
  }
  return "handled button action";
}

function action(update, handled) {
  if (!handled) return "ignored; no bot action";
  if (update && update.callback_query) return update.callback_query._activityAction || callbackAction(update.callback_query.data);
  const message = update && update.message || {};
  if (message._activityAction) return message._activityAction;
  if (Array.isArray(message.photo) && message.photo.length) return "saved feedback photo";
  const text = String(message.text || "").trim();
  if (/^\/(?:start|home)(?:@\S+)?(?:\s|$)/i.test(text)) return "sent home dashboard";
  if (/^\/meals(?:@\S+)?(?:\s|$)/i.test(text)) return "sent meals dashboard";
  if (/^\/settings(?:@\S+)?(?:\s|$)/i.test(text)) return "sent settings";
  if (/^\/ask(?:@\S+)?\s+\S/i.test(text)) return "answered household question";
  if (/^\/ask(?:@\S+)?(?:\s|$)/i.test(text)) return "sent ask instructions";
  if (/https?:\/\//i.test(text)) return "analyzed recipe link";
  return "answered household question";
}

function prefix(update, chat) {
  return "(" + person(update) + " from " + place(chat) + ")";
}

function write(app, line, updateId) {
  try {
    app.logger().info(line, "telegram_update_id", String(updateId));
  } catch (_) {}
  try {
    if (typeof console !== "undefined" && typeof console.log === "function") console.log(line);
  } catch (_) {}
}

function received(app, update, chat) {
  write(app, "Telegram received " + prefix(update, chat) + ": " + content(update), update.update_id);
}

function completed(app, update, chat, description) {
  write(app, "Telegram action " + prefix(update, chat) + ": " + clean(description, 1000), update.update_id);
}

module.exports = { action, buttonText, callbackAction, clean, completed, content, person, place, received };
