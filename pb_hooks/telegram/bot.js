"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const planning = require(`${__hooks}/meal_planning/service.js`);
const client = require(`${__hooks}/telegram/client.js`);
const commands = require(`${__hooks}/telegram/commands.js`);
const security = require(`${__hooks}/telegram/security.js`);
const state = require(`${__hooks}/telegram/state.js`);
const views = require(`${__hooks}/telegram/views.js`);

const BOT_COMMANDS = [
  { command: "start", description: "Open the meal planner help" },
  { command: "today", description: "Show today’s meal plan" },
  { command: "tomorrow", description: "Show tomorrow’s meal plan" },
  { command: "week", description: "Show the Monday-to-Sunday plan" },
  { command: "suggest", description: "Suggest tomorrow’s meals" },
  { command: "last", description: "Reuse the last meal for a slot" },
  { command: "buy", description: "Mark a slot as buy food" },
  { command: "eatout", description: "Mark a slot as eating out" },
  { command: "skip", description: "Skip a meal slot" },
  { command: "feedback", description: "Rate one of today’s meals" },
  { command: "photo", description: "Show the active photo meal" },
  { command: "cancel", description: "Clear the active feedback meal" },
  { command: "subscribe", description: "Send daily planning to this chat" },
  { command: "unsubscribe", description: "Stop daily planning in this chat" },
  { command: "help", description: "Show all commands" },
];

function first(app, collection, filter, params) {
  const records = app.findRecordsByFilter(collection, filter, "", 1, 0, params || {});
  return records.length ? records[0] : null;
}

function safeCode(error) {
  const value = String(error && error.message || "internal_error").toLowerCase();
  return /^[a-z0-9_]{1,120}$/.test(value) ? value : "internal_error";
}

function friendlyError(error) {
  const code = safeCode(error);
  if (code === "no_last_meal") return "There isn’t a previous meal for that slot yet.";
  if (code === "meal_not_planned") return "That meal has no planned dish to rate.";
  if (code === "openrouter_not_configured" || code === "openrouter_request_failed" || code === "invalid_ai_response") {
    return "I couldn’t generate a suggestion right now. Please try /suggest again later.";
  }
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

function helpText() {
  return [
    "<b>Meal planner commands</b>",
    "",
    "/subscribe — daily messages in this chat",
    "/unsubscribe — stop daily messages here",
    "/today — today’s plan",
    "/tomorrow — tomorrow’s plan",
    "/week — Monday to Sunday",
    "/suggest [breakfast|lunch|dinner] [preference]",
    "Example: /suggest dinner seafood",
    "/last [breakfast|lunch|dinner]",
    "/buy [breakfast|lunch|dinner]",
    "/eatout [breakfast|lunch|dinner]",
    "/skip [breakfast|lunch|dinner]",
    "/feedback [breakfast|lunch|dinner]",
    "/photo — show the active photo meal",
    "/cancel — clear the active feedback meal",
    "/help — this list",
  ].join("\n");
}

function sendSuggestion(app, destination, suggestion) {
  const slot = planning.slotValue(app, suggestion.getString("date"), suggestion.getString("meal"));
  return client.sendMessage(
    chatId(destination),
    views.suggestionText(suggestion, slot),
    views.suggestionKeyboard(suggestion),
  );
}

function editSuggestion(app, destination, messageId, suggestion) {
  const slot = planning.slotValue(app, suggestion.getString("date"), suggestion.getString("meal"));
  return client.editMessageText(
    chatId(destination),
    messageId,
    views.suggestionText(suggestion, slot),
    views.suggestionKeyboard(suggestion),
  );
}

function registerCommands() {
  return client.setCommands(BOT_COMMANDS);
}

function maybeSendTomorrowReport(app, destination, date, wasComplete) {
  const tomorrow = calendar.addDays(planning.today(), 1);
  if (date !== tomorrow || wasComplete || !planning.dayIsResolved(app, date)) return false;
  client.sendMessage(chatId(destination), views.dayText(planning.dayValue(app, date), "Tomorrow’s plan"));
  return true;
}

function sendFeedbackPrompt(app, destination, date, meal) {
  const assignment = planning.assignmentFor(app, date, meal);
  if (!assignment || !assignment.getString("dish")) return null;
  const dish = app.findRecordById("dishes", assignment.getString("dish"));
  return client.sendMessage(
    chatId(destination),
    "How was today’s <b>" + meal + "</b>?\n<b>" + views.escape(dish.getString("name")) + "</b>",
    views.feedbackKeyboard(assignment),
  );
}

function mealOrPicker(destination, action, meal, date, prompt) {
  if (meal) return false;
  client.sendMessage(chatId(destination), prompt, views.mealPicker(action, date));
  return true;
}

function handleCommand(app, user, destination, message, parsed) {
  const destinationId = chatId(destination);
  const today = planning.today();
  const tomorrow = calendar.addDays(today, 1);
  const meal = commands.mealArgument(parsed.args);

  if (parsed.command === "start" || parsed.command === "help") {
    client.sendMessage(destinationId, helpText());
    return true;
  }
  if (parsed.command === "subscribe") {
    state.subscribe(app, destination, true);
    client.sendMessage(destinationId, "Daily meal planning is enabled here for <b>18:30 Europe/Amsterdam</b>.");
    return true;
  }
  if (parsed.command === "unsubscribe") {
    state.subscribe(app, destination, false);
    client.sendMessage(destinationId, "Daily meal planning is disabled for this chat.");
    return true;
  }
  if (parsed.command === "today") {
    client.sendMessage(destinationId, views.dayText(planning.dayValue(app, today), "Today"));
    return true;
  }
  if (parsed.command === "tomorrow") {
    client.sendMessage(destinationId, views.dayText(planning.dayValue(app, tomorrow), "Tomorrow"));
    return true;
  }
  if (parsed.command === "week") {
    client.sendMessage(destinationId, views.weekText(planning.weekValue(app, today)));
    return true;
  }
  if (parsed.command === "suggest") {
    if (parsed.args.length && !meal) {
      client.sendMessage(destinationId, "Start with a meal, for example: <code>/suggest dinner meat</code>");
      return true;
    }
    try {
      const requested = meal ? [meal] : calendar.MEALS;
      const preference = commands.suggestionPreference(parsed);
      const suggestions = planning.generateSuggestions(app, tomorrow, requested, preference);
      for (const suggestion of suggestions) sendSuggestion(app, destination, suggestion);
    } catch (error) {
      const message = friendlyError(error);
      if (!message) throw error;
      client.sendMessage(destinationId, message);
    }
    return true;
  }
  if (["last", "buy", "eatout", "skip", "feedback"].indexOf(parsed.command) !== -1) {
    const action = parsed.command === "eatout" ? "out" : parsed.command;
    if (mealOrPicker(destination, action, meal, parsed.command === "feedback" ? today : tomorrow, "Choose a meal:")) return true;
    try {
      const actionDate = parsed.command === "feedback" ? today : tomorrow;
      const wasComplete = actionDate === tomorrow && planning.dayIsResolved(app, actionDate);
      const result = performAction(app, destination, action, actionDate, meal);
      if (result && !maybeSendTomorrowReport(app, destination, actionDate, wasComplete)) {
        client.sendMessage(destinationId, result.text);
      }
    } catch (error) {
      const failure = friendlyError(error);
      if (!failure) throw error;
      client.sendMessage(destinationId, failure);
    }
    return true;
  }
  if (parsed.command === "photo") {
    const conversation = state.activeConversation(app, user, destination);
    if (!conversation) {
      client.sendMessage(destinationId, "There is no active feedback meal. Rate a meal first, then send its photo.");
      return true;
    }
    const occurrence = app.findRecordById("cooked_occurrences", conversation.getString("occurrence"));
    client.sendMessage(destinationId, "The next photo will be attached to <b>" + occurrence.getString("date") + " · " + occurrence.getString("meal") + "</b>.");
    return true;
  }
  if (parsed.command === "cancel") {
    state.clearConversation(app, user, destination);
    client.sendMessage(destinationId, "Current feedback/photo selection cleared.");
    return true;
  }
  return false;
}

function performAction(app, destination, action, date, meal) {
  calendar.parseDate(date);
  calendar.assertMeal(meal);
  let text = "";
  if (action === "last") {
    const assignment = planning.useLastMeal(app, date, meal);
    const dish = app.findRecordById("dishes", assignment.getString("dish"));
    text = "↩️ <b>" + views.escape(dish.getString("name")) + "</b> is planned for " + date + " · " + meal + ".";
  } else if (action === "buy") {
    planning.setSpecialStatus(app, date, meal, "buy_food");
    text = "🛒 Buy food is set for " + date + " · " + meal + ".";
  } else if (action === "out") {
    planning.setSpecialStatus(app, date, meal, "eating_out");
    text = "🍽 Eat out is set for " + date + " · " + meal + ".";
  } else if (action === "skip") {
    planning.setSpecialStatus(app, date, meal, "skipped");
    text = "⏭ " + date + " · " + meal + " is marked skipped.";
  } else if (action === "feedback") {
    const assignment = planning.assignmentFor(app, date, meal);
    if (!assignment || !assignment.getString("dish")) throw new Error("meal_not_planned");
    const dish = app.findRecordById("dishes", assignment.getString("dish"));
    client.sendMessage(
      chatId(destination),
      "How was <b>" + views.escape(dish.getString("name")) + "</b> for " + meal + "?",
      views.feedbackKeyboard(assignment),
    );
    return null;
  } else {
    throw new Error("invalid_action");
  }
  return { text };
}

function handleCallback(app, user, destination, query) {
  const parts = String(query.data || "").split(":");
  if (parts[0] === "sg" && parts.length === 3) {
    const suggestion = app.findRecordById("meal_suggestions", parts[2]);
    if (parts[1] === "use") {
      const date = suggestion.getString("date");
      const wasComplete = planning.dayIsResolved(app, date);
      const assignment = planning.acceptSuggestion(app, suggestion.id, user.getString("member"));
      client.answerCallback(query.id, "Meal planned", false);
      if (query.message && query.message.message_id) {
        const slot = planning.slotValue(app, date, assignment.getString("meal"));
        client.editMessageText(
          chatId(destination),
          query.message.message_id,
          views.selectedSuggestionText(suggestion, slot),
          { inline_keyboard: [] },
        );
      }
      maybeSendTomorrowReport(app, destination, date, wasComplete);
      return true;
    }
    if (parts[1] === "next") {
      try {
        const replacements = planning.generateSuggestions(
          app,
          suggestion.getString("date"),
          [suggestion.getString("meal")],
          suggestion.getString("request_text"),
        );
        client.answerCallback(query.id, "New suggestion ready", false);
        editSuggestion(app, destination, query.message.message_id, replacements[0]);
      } catch (error) {
        const failure = friendlyError(error);
        if (!failure) throw error;
        client.answerCallback(query.id, failure, true);
      }
      return true;
    }
  }
  if (parts[0] === "act" && parts.length === 4) {
    try {
      const date = parts[2];
      const wasComplete = planning.dayIsResolved(app, date);
      const result = performAction(app, destination, parts[1], date, parts[3]);
      client.answerCallback(query.id, "Saved", false);
      if (result && query.message && query.message.message_id) {
        client.editMessageText(
          chatId(destination),
          query.message.message_id,
          views.selectedSlotText(planning.slotValue(app, date, parts[3]), date),
          { inline_keyboard: [] },
        );
      }
      if (result) maybeSendTomorrowReport(app, destination, date, wasComplete);
    } catch (error) {
      const failure = friendlyError(error);
      if (!failure) throw error;
      client.answerCallback(query.id, failure, true);
    }
    return true;
  }
  if (parts[0] === "fa" && parts.length === 3) {
    const rating = parts[1];
    const assignment = app.findRecordById("meal_assignments", parts[2]);
    const occurrence = planning.ensureOccurrence(app, assignment.getString("date"), assignment.getString("meal"));
    if (!occurrence) throw new Error("meal_not_planned");
    planning.saveFeedback(app, occurrence.id, user.getString("member"), rating);
    state.setConversation(app, user, destination, occurrence, query.message && query.message.message_id);
    const dish = app.findRecordById("dishes", occurrence.getString("dish"));
    client.answerCallback(query.id, "Feedback saved", false);
    client.sendMessage(
      chatId(destination),
      "Feedback saved for <b>" + occurrence.getString("date") + " · " + occurrence.getString("meal") + ": " + views.escape(dish.getString("name")) + "</b>.\nSend a photo now and I’ll attach it to this meal.",
    );
    return true;
  }
  return false;
}

function largestPhoto(photos) {
  let selected = null;
  for (const photo of photos || []) {
    if (!selected || Number(photo.file_size || 0) >= Number(selected.file_size || 0)) selected = photo;
  }
  return selected;
}

function handlePhoto(app, user, destination, message) {
  const conversation = state.activeConversation(app, user, destination);
  if (!conversation) return false;
  const occurrence = app.findRecordById("cooked_occurrences", conversation.getString("occurrence"));
  const photo = largestPhoto(message.photo);
  if (!photo) return false;
  const existing = first(
    app,
    "meal_photos",
    "occurrence = {:occurrence} && telegram_file_unique_id = {:file}",
    { occurrence: occurrence.id, file: String(photo.file_unique_id) },
  );
  if (!existing) {
    const file = client.downloadPhoto(photo.file_id, photo.file_unique_id);
    const record = new Record(app.findCollectionByNameOrId("meal_photos"));
    record.set("occurrence", occurrence.id);
    record.set("member", user.getString("member"));
    record.set("photo", file);
    record.set("telegram_file_id", String(photo.file_id));
    record.set("telegram_file_unique_id", String(photo.file_unique_id));
    record.set("telegram_message_id", String(message.message_id));
    app.save(record);
  }
  state.clearConversation(app, user, destination);
  const dish = app.findRecordById("dishes", occurrence.getString("dish"));
  client.sendMessage(
    chatId(destination),
    "📷 Photo saved for <b>" + occurrence.getString("date") + " · " + occurrence.getString("meal") + ": " + views.escape(dish.getString("name")) + "</b>.",
  );
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
      if (parsed) handled = handleCommand(app, user, destination, update.message, parsed);
    }
    finishUpdate(app, updateRecord, handled ? "processed" : "ignored");
  } catch (error) {
    finishUpdate(app, updateRecord, "failed", safeCode(error));
    throw error;
  }
}

module.exports = {
  handle,
  handlePhoto,
  helpText,
  editSuggestion,
  registerCommands,
  sendFeedbackPrompt,
  sendSuggestion,
};
