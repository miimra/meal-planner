"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const planning = require(`${__hooks}/meal_planning/service.js`);
const imageGenerator = require(`${__hooks}/openrouter/image.js`);
const assistant = require(`${__hooks}/telegram/assistant.js`);
const client = require(`${__hooks}/telegram/client.js`);
const commands = require(`${__hooks}/telegram/commands.js`);
const security = require(`${__hooks}/telegram/security.js`);
const state = require(`${__hooks}/telegram/state.js`);
const views = require(`${__hooks}/telegram/views.js`);

const BOT_COMMANDS = [
  { command: "home", description: "Open the household dashboard" },
  { command: "meals", description: "View or change meal plans" },
  { command: "ask", description: "Ask a household question" },
  { command: "settings", description: "Daily updates and help" },
];

function first(app, collection, filter, params) {
  const records = app.findRecordsByFilter(collection, filter, "", 1, 0, params || {});
  return records.length ? records[0] : null;
}

function safeCode(error) {
  const value = String(error && error.message || "internal_error").toLowerCase();
  const normalized = value.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
  return normalized || "internal_error";
}

function friendlyError(error) {
  const code = safeCode(error);
  if (code === "no_last_meal") return "There isn’t a previous meal for that slot yet.";
  if (code === "meal_not_planned") return "That meal has no planned dish to rate.";
  if (code.indexOf("openrouter") === 0 || code === "invalid_ai_response") return "I couldn’t do that right now. Please try again later.";
  return null;
}

function claimUpdate(app, update, kind) {
  const id = String(update.update_id);
  let record = first(app, "telegram_updates", "update_id = {:id}", { id });
  if (record && ["processed", "ignored"].indexOf(record.getString("status")) !== -1) return null;
  if (record && record.getString("status") === "processing") {
    const updated = new Date(record.getString("updated")).getTime();
    if (Number.isFinite(updated) && Date.now() - updated < 5 * 60 * 1000) return null;
  }
  if (!record) record = new Record(app.findCollectionByNameOrId("telegram_updates"));
  record.set("update_id", id);
  record.set("status", "processing");
  record.set("kind", kind);
  record.set("error_code", "");
  app.save(record);
  return record;
}

function finishUpdate(app, record, status, errorCode) {
  record.set("status", status);
  record.set("error_code", errorCode || "");
  app.save(record);
}

function chatId(record) {
  return record.getString("chat_id");
}

function sendPanel(destination, text, keyboard) {
  return client.sendMessage(chatId(destination), text, keyboard);
}

function panelTextForMedia(text) {
  const value = String(text || "");
  return value.length <= 1000 ? value : value.slice(0, 990) + "\n…";
}

function messageHasMedia(message) {
  return Boolean(message && (message.photo || message.video || message.animation || message.document));
}

function editPanel(destination, message, text, keyboard) {
  if (!message || !message.message_id) throw new Error("callback_message_missing");
  if (messageHasMedia(message)) {
    return client.editMessageCaption(chatId(destination), message.message_id, panelTextForMedia(text), keyboard);
  }
  return client.editMessageText(chatId(destination), message.message_id, text, keyboard);
}

function homeView(app, destination) {
  const today = planning.today();
  const tomorrow = calendar.addDays(today, 1);
  return {
    text: views.homeText(planning.dayValue(app, today), planning.dayValue(app, tomorrow), destination.getBool("daily_enabled")),
    keyboard: views.homeKeyboard(today),
  };
}

function sendHome(app, destination) {
  const view = homeView(app, destination);
  return sendPanel(destination, view.text, view.keyboard);
}

function editHome(app, destination, message) {
  const view = homeView(app, destination);
  return editPanel(destination, message, view.text, view.keyboard);
}

function registerCommands() {
  return client.setCommands(BOT_COMMANDS);
}

function helpText() {
  return views.settingsText(false);
}

function telegramPhotoId(result) {
  let found = "";
  function visit(value, key) {
    if (!value || found) return;
    if (key === "photo" && Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        if (value[index] && value[index].file_id) {
          found = String(value[index].file_id);
          return;
        }
      }
    }
    if (typeof value !== "object") return;
    for (const childKey of Object.keys(value)) visit(value[childKey], childKey);
  }
  visit(result, "");
  return found;
}

function storedImageFile(app, suggestion) {
  const filename = suggestion.getString("generated_image");
  if (!filename) return null;
  const filesystem = app.newFilesystem();
  return {
    file: filesystem.getReuploadableFile(suggestion.baseFilesPath() + "/" + filename, true),
    close: () => filesystem.close(),
  };
}

function ensureSuggestionImage(app, suggestion) {
  const cachedFileId = suggestion.getString("telegram_image_file_id");
  if (cachedFileId) return { photo: cachedFileId, generated: false };
  if (suggestion.getString("generated_image")) {
    const stored = storedImageFile(app, suggestion);
    return { photo: stored.file, close: stored.close, generated: false };
  }
  const image = imageGenerator.generate(suggestion.getString("suggested_name"), require(`${__hooks}/shared/json.js`).arrayField(suggestion, "ingredients"));
  const file = $filesystem.fileFromBytes(image.bytes, "suggestion-" + suggestion.id + "." + image.extension);
  suggestion.set("generated_image", file);
  suggestion.set("generated_image_model", image.model);
  app.save(suggestion);
  return {
    photo: $filesystem.fileFromBytes(image.bytes, "suggestion-upload-" + suggestion.id + "." + image.extension),
    generated: true,
  };
}

function storeTelegramImageId(app, suggestion, result) {
  const id = telegramPhotoId(result);
  if (id && id !== suggestion.getString("telegram_image_file_id")) {
    suggestion.set("telegram_image_file_id", id);
    app.save(suggestion);
  }
}

function showSuggestion(app, destination, message, suggestion, selected) {
  const slot = planning.slotValue(app, suggestion.getString("date"), suggestion.getString("meal"));
  const caption = views.suggestionCaption(suggestion, slot, selected);
  const keyboard = views.suggestionKeyboard(suggestion, selected);
  let image = null;
  try {
    image = ensureSuggestionImage(app, suggestion);
  } catch (error) {
    app.logger().warn("Suggestion image unavailable", "suggestion", suggestion.id, "error_code", safeCode(error));
  }
  if (image && image.photo) {
    let result;
    try {
      result = client.editMessageRichPhoto(chatId(destination), message.message_id, image.photo, caption, keyboard);
    } finally {
      if (image.close) image.close();
    }
    storeTelegramImageId(app, suggestion, result);
    return result;
  }

  const fallback = caption + "\n\n<i>Photo unavailable for this suggestion.</i>\n\n" + views.suggestionDetails(suggestion, slot);
  return editPanel(destination, message, fallback, keyboard);
}

function markSuggestionSelected(app, destination, message, suggestion) {
  const slot = planning.slotValue(app, suggestion.getString("date"), suggestion.getString("meal"));
  const caption = views.suggestionCaption(suggestion, slot, true);
  const keyboard = views.suggestionKeyboard(suggestion, true);
  if (messageHasMedia(message)) return client.editMessageCaption(chatId(destination), message.message_id, caption, keyboard);
  return client.editMessageText(chatId(destination), message.message_id, caption + "\n\n" + views.suggestionDetails(suggestion, slot), keyboard);
}

function performAction(app, action, date, meal) {
  calendar.parseDate(date);
  calendar.assertMeal(meal);
  if (action === "last") return planning.useLastMeal(app, date, meal);
  if (action === "buy") return planning.setSpecialStatus(app, date, meal, "buy_food");
  if (action === "out") return planning.setSpecialStatus(app, date, meal, "eating_out");
  if (action === "skip") return planning.setSpecialStatus(app, date, meal, "skipped");
  throw new Error("invalid_action");
}

function showFeedback(app, destination, message, date, meal) {
  const assignment = planning.assignmentFor(app, date, meal);
  if (!assignment || !assignment.getString("dish")) throw new Error("meal_not_planned");
  const dish = app.findRecordById("dishes", assignment.getString("dish"));
  return editPanel(destination, message, "⭐ <b>" + views.escape(date + " · " + meal) + "</b>\n\nHow was <b>" + views.escape(dish.getString("name")) + "</b>?", views.feedbackKeyboard(assignment));
}

function handleCommand(app, user, destination, message, parsed) {
  const today = planning.today();
  const tomorrow = calendar.addDays(today, 1);
  if (parsed.command === "start" || parsed.command === "home") {
    sendHome(app, destination);
    return true;
  }
  if (parsed.command === "meals") {
    sendPanel(destination, views.mealsText(), views.mealsKeyboard(today, tomorrow));
    return true;
  }
  if (parsed.command === "settings") {
    sendPanel(destination, views.settingsText(destination.getBool("daily_enabled")), views.settingsKeyboard(destination.getBool("daily_enabled")));
    return true;
  }
  if (parsed.command === "ask") {
    const question = (parsed.rawArgs || []).join(" ").trim();
    if (!question) sendPanel(destination, views.askText(), { inline_keyboard: [[{ text: "🏠 Home", callback_data: "nav:home" }]] });
    else sendPanel(destination, views.escape(assistant.answer(app, question)), { inline_keyboard: [[{ text: "💬 Ask another", callback_data: "nav:ask" }, { text: "🏠 Home", callback_data: "nav:home" }]] });
    return true;
  }
  return false;
}

function handleNavigation(app, destination, message, parts) {
  const today = planning.today();
  const tomorrow = calendar.addDays(today, 1);
  if (parts[1] === "home") return editHome(app, destination, message);
  if (parts[1] === "meals") return editPanel(destination, message, views.mealsText(), views.mealsKeyboard(today, tomorrow));
  if (parts[1] === "ask") return editPanel(destination, message, views.askText(), { inline_keyboard: [[{ text: "🏠 Home", callback_data: "nav:home" }]] });
  if (parts[1] === "settings") return editPanel(destination, message, views.settingsText(destination.getBool("daily_enabled")), views.settingsKeyboard(destination.getBool("daily_enabled")));
  if (parts[1] === "change") return editPanel(destination, message, "✏️ <b>Choose a date</b>", views.dateKeyboard(today));
  if (parts[1] === "day" && parts[2]) return editPanel(destination, message, views.dayText(planning.dayValue(app, parts[2]), parts[2] === today ? "Today" : parts[2] === tomorrow ? "Tomorrow" : "Meal plan"), views.dayKeyboard(parts[2]));
  if (parts[1] === "week") return editPanel(destination, message, views.weekText(planning.weekValue(app, today)), { inline_keyboard: [[{ text: "‹ Meals", callback_data: "nav:meals" }, { text: "🏠 Home", callback_data: "nav:home" }]] });
  return null;
}

function handleCallback(app, user, destination, query) {
  const parts = String(query.data || "").split(":");
  try {
    if (parts[0] === "nav") {
      handleNavigation(app, destination, query.message, parts);
      client.answerCallback(query.id, "", false);
      return true;
    }
    if (parts[0] === "set" && parts[1] === "daily") {
      const enabled = parts[2] === "on";
      destination = state.subscribe(app, destination, enabled);
      editPanel(destination, query.message, views.settingsText(enabled), views.settingsKeyboard(enabled));
      client.answerCallback(query.id, enabled ? "Daily update enabled" : "Daily update disabled", false);
      return true;
    }
    if (parts[0] === "pick" && parts[1] === "date" && parts[2]) {
      calendar.parseDate(parts[2]);
      editPanel(destination, query.message, "✏️ <b>Choose a meal · " + parts[2] + "</b>", views.mealKeyboard(parts[2], "pick:meal"));
      client.answerCallback(query.id, "", false);
      return true;
    }
    if (parts[0] === "pick" && parts[1] === "meal" && parts.length === 4) {
      calendar.parseDate(parts[2]);
      calendar.assertMeal(parts[3]);
      editPanel(destination, query.message, "✏️ <b>Change " + views.escape(parts[2] + " · " + parts[3]) + "</b>\n\nChoose an option. The plan changes only after you tap one of these buttons or accept a suggestion.", views.actionKeyboard(parts[2], parts[3]));
      client.answerCallback(query.id, "", false);
      return true;
    }
    if (parts[0] === "do" && parts.length === 4) {
      if (parts[1] === "suggest") {
        const suggestion = planning.generateSuggestions(app, parts[2], [parts[3]])[0];
        showSuggestion(app, destination, query.message, suggestion, false);
        client.answerCallback(query.id, "Suggestion ready", false);
      } else {
        performAction(app, parts[1], parts[2], parts[3]);
        editHome(app, destination, query.message);
        client.answerCallback(query.id, "Plan updated", false);
      }
      return true;
    }
    if (parts[0] === "sg" && parts.length === 3) {
      const suggestion = app.findRecordById("meal_suggestions", parts[2]);
      if (parts[1] === "use") {
        planning.acceptSuggestion(app, suggestion.id, user.getString("member"));
        client.answerCallback(query.id, "Meal planned", false);
        markSuggestionSelected(app, destination, query.message, suggestion);
        return true;
      }
      if (parts[1] === "next") {
        const replacement = planning.generateSuggestions(app, suggestion.getString("date"), [suggestion.getString("meal")], suggestion.getString("request_text"))[0];
        showSuggestion(app, destination, query.message, replacement, false);
        client.answerCallback(query.id, "New suggestion ready", false);
        return true;
      }
      if (parts[1] === "details") {
        const slot = planning.slotValue(app, suggestion.getString("date"), suggestion.getString("meal"));
        editPanel(destination, query.message, views.suggestionDetails(suggestion, slot), { inline_keyboard: [
          [{ text: "‹ Suggestion", callback_data: "sg:card:" + suggestion.id }, { text: "✏️ Change", callback_data: "pick:meal:" + suggestion.getString("date") + ":" + suggestion.getString("meal") }],
          [{ text: "🏠 Home", callback_data: "nav:home" }],
        ] });
        client.answerCallback(query.id, "", false);
        return true;
      }
      if (parts[1] === "card") {
        const selected = suggestion.getString("outcome") === "accepted";
        showSuggestion(app, destination, query.message, suggestion, selected);
        client.answerCallback(query.id, "", false);
        return true;
      }
    }
    if (parts[0] === "fb" && parts[1] === "date" && parts[2]) {
      editPanel(destination, query.message, "⭐ <b>Choose a meal to rate · " + parts[2] + "</b>", views.mealKeyboard(parts[2], "fb:meal"));
      client.answerCallback(query.id, "", false);
      return true;
    }
    if (parts[0] === "fb" && parts[1] === "meal" && parts.length === 4) {
      showFeedback(app, destination, query.message, parts[2], parts[3]);
      client.answerCallback(query.id, "", false);
      return true;
    }
    if (parts[0] === "fa" && parts.length === 3) {
      const assignment = app.findRecordById("meal_assignments", parts[2]);
      const occurrence = planning.ensureOccurrence(app, assignment.getString("date"), assignment.getString("meal"));
      if (!occurrence) throw new Error("meal_not_planned");
      planning.saveFeedback(app, occurrence.id, user.getString("member"), parts[1]);
      state.setConversation(app, user, destination, occurrence, query.message && query.message.message_id);
      const dish = app.findRecordById("dishes", occurrence.getString("dish"));
      editPanel(destination, query.message, "✅ Feedback saved for <b>" + views.escape(occurrence.getString("date") + " · " + occurrence.getString("meal") + ": " + dish.getString("name")) + "</b>.\n\nSend a photo now and I’ll attach it to this meal.", { inline_keyboard: [[{ text: "🏠 Home", callback_data: "nav:home" }]] });
      client.answerCallback(query.id, "Feedback saved", false);
      return true;
    }
  } catch (error) {
    const failure = friendlyError(error);
    if (!failure) throw error;
    client.answerCallback(query.id, failure, true);
    return true;
  }
  return false;
}

function largestPhoto(photos) {
  let selected = null;
  for (const photo of photos || []) if (!selected || Number(photo.file_size || 0) >= Number(selected.file_size || 0)) selected = photo;
  return selected;
}

function handlePhoto(app, user, destination, message) {
  const conversation = state.activeConversation(app, user, destination);
  if (!conversation) return false;
  const occurrence = app.findRecordById("cooked_occurrences", conversation.getString("occurrence"));
  const photo = largestPhoto(message.photo);
  if (!photo) return false;
  const existing = first(app, "meal_photos", "occurrence = {:occurrence} && telegram_file_unique_id = {:file}", { occurrence: occurrence.id, file: String(photo.file_unique_id) });
  if (!existing) {
    const record = new Record(app.findCollectionByNameOrId("meal_photos"));
    record.set("occurrence", occurrence.id);
    record.set("member", user.getString("member"));
    record.set("photo", client.downloadPhoto(photo.file_id, photo.file_unique_id));
    record.set("telegram_file_id", String(photo.file_id));
    record.set("telegram_file_unique_id", String(photo.file_unique_id));
    record.set("telegram_message_id", String(message.message_id));
    app.save(record);
  }
  state.clearConversation(app, user, destination);
  const dish = app.findRecordById("dishes", occurrence.getString("dish"));
  sendPanel(destination, "📷 Photo saved for <b>" + views.escape(occurrence.getString("date") + " · " + occurrence.getString("meal") + ": " + dish.getString("name")) + "</b>.", { inline_keyboard: [[{ text: "🏠 Home", callback_data: "nav:home" }]] });
  return true;
}

function handleQuestion(app, destination, message) {
  const question = commands.questionText(message, destination.getString("type"), commands.botUsername());
  if (question === null) return false;
  try {
    const answer = assistant.answer(app, question);
    sendPanel(destination, views.escape(answer), { inline_keyboard: [[{ text: "💬 Ask another", callback_data: "nav:ask" }, { text: "🏠 Home", callback_data: "nav:home" }]] });
  } catch (error) {
    const failure = friendlyError(error);
    if (!failure) throw error;
    sendPanel(destination, failure, { inline_keyboard: [[{ text: "🏠 Home", callback_data: "nav:home" }]] });
  }
  return true;
}

function handle(app, update) {
  if (!update || typeof update.update_id === "undefined") return;
  const kind = security.updateKind(update);
  const updateRecord = claimUpdate(app, update, kind);
  if (!updateRecord) return;
  try {
    const sender = security.senderId(update);
    const chat = security.chatFromUpdate(update);
    const user = sender ? state.authorizedUser(app, sender) : null;
    if (!user || !chat) {
      finishUpdate(app, updateRecord, "ignored");
      return;
    }
    const destination = state.ensureChat(app, chat, user);
    let handled = false;
    if (kind === "callback_query") handled = handleCallback(app, user, destination, update.callback_query);
    if (kind === "photo") handled = handlePhoto(app, user, destination, update.message);
    if (kind === "message") {
      const parsed = commands.parseCommand(update.message.text);
      handled = parsed ? handleCommand(app, user, destination, update.message, parsed) : handleQuestion(app, destination, update.message);
    }
    finishUpdate(app, updateRecord, handled ? "processed" : "ignored");
  } catch (error) {
    finishUpdate(app, updateRecord, "failed", safeCode(error));
    throw error;
  }
}

module.exports = {
  BOT_COMMANDS,
  handle,
  handlePhoto,
  helpText,
  registerCommands,
  editHome,
  editPanel,
  sendHome,
  sendPanel,
  showSuggestion,
};
