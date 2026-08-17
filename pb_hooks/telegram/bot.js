"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const planning = require(`${__hooks}/meal_planning/service.js`);
const photos = require(`${__hooks}/meal_planning/photo.js`);
const assistant = require(`${__hooks}/telegram/assistant.js`);
const activity = require(`${__hooks}/telegram/activity.js`);
const client = require(`${__hooks}/telegram/client.js`);
const commands = require(`${__hooks}/telegram/commands.js`);
const security = require(`${__hooks}/telegram/security.js`);
const state = require(`${__hooks}/telegram/state.js`);
const views = require(`${__hooks}/telegram/views.js`);
const recipeImports = require(`${__hooks}/recipe_import/service.js`);
const recipeUrls = require(`${__hooks}/recipe_import/url.js`);
const json = require(`${__hooks}/shared/json.js`);

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
  if (code === "planning_date_passed") return "That planning button is for an earlier date. Open Meals to choose today or a future date.";
  if (code === "suggestion_not_pending") return "That suggestion is no longer active. Open the current meal plan to make a new choice.";
  if (code === "dinner_category_required") return "Choose the dinner category first.";
  if (code === "invalid_dinner_category") return "That category does not belong to this dinner date.";
  if (code === "meal_not_planned") return "That meal has no planned dish to rate.";
  if (code === "dish_name_required") return "Send the dish name as plain text and I’ll plan it.";
  if (code === "recipe_import_category_required") return "Choose a household category before saving this recipe.";
  if (code.indexOf("recipe_import_") === 0) return "This recipe card is no longer available for that action.";
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

function sendPanel(destination, text, keyboard, replyToMessageId) {
  return client.sendMessage(chatId(destination), text, keyboard, replyToMessageId);
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
  const todayValue = planning.dayValue(app, today);
  return {
    text: views.homeText(todayValue, planning.dayValue(app, tomorrow), destination.getBool("daily_enabled")),
    keyboard: views.homeKeyboard(today, tomorrow, calendar.MEALS.some((meal) => todayValue.meals[meal].dish)),
  };
}

function dailyView(app) {
  const today = planning.today();
  const todayValue = planning.dayValue(app, today);
  const tomorrowValue = planning.dayValue(app, calendar.addDays(today, 1));
  return {
    text: views.dailyText(todayValue, tomorrowValue),
    keyboard: views.dailyKeyboard(today, tomorrowValue, calendar.MEALS.some((meal) => todayValue.meals[meal].dish)),
  };
}

function sendHome(app, destination, replyToMessageId) {
  const view = homeView(app, destination);
  return sendPanel(destination, view.text, view.keyboard, replyToMessageId);
}

function sendDaily(app, destination) {
  const view = dailyView(app);
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

function suggestionPhoto(suggestion) {
  return suggestion.getString("telegram_image_file_id") || photos.lookup(suggestion.getString("suggested_name"));
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
  let photo = "";
  try {
    photo = suggestionPhoto(suggestion);
  } catch (error) {
    app.logger().warn("Suggestion photo unavailable", "suggestion", suggestion.id, "error_code", safeCode(error));
  }
  if (photo) {
    const result = client.editMessageRichPhoto(chatId(destination), message.message_id, photo, caption, keyboard);
    storeTelegramImageId(app, suggestion, result);
    return result;
  }
  return editPanel(destination, message, caption + "\n\n" + views.suggestionDetails(suggestion, slot), keyboard);
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
  if (date < planning.today()) throw new Error("planning_date_passed");
  if (action === "last" || action === "leftovers") return planning.setSpecialStatus(app, date, meal, "leftovers");
  if (action === "buy") return planning.setSpecialStatus(app, date, meal, "buy_food");
  if (action === "out") return planning.setSpecialStatus(app, date, meal, "eating_out");
  if (action === "skip") return planning.setSpecialStatus(app, date, meal, "skipped");
  throw new Error("invalid_action");
}

function assertPlanningDate(date) {
  calendar.parseDate(date);
  if (date < planning.today()) throw new Error("planning_date_passed");
}

function assertSuggestionPending(suggestion) {
  if (suggestion.getString("outcome") !== "pending") throw new Error("suggestion_not_pending");
}

function editAction(app, destination, message, date, meal) {
  const slot = planning.slotValue(app, date, meal);
  return editPanel(destination, message, views.actionText(date, meal, slot), views.actionKeyboard(date, meal, slot));
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
    sendHome(app, destination, message.message_id);
    return true;
  }
  if (parsed.command === "meals") {
    sendPanel(destination, views.mealsText(), views.mealsKeyboard(today, tomorrow), message.message_id);
    return true;
  }
  if (parsed.command === "settings") {
    sendPanel(destination, views.settingsText(destination.getBool("daily_enabled")), views.settingsKeyboard(destination.getBool("daily_enabled")), message.message_id);
    return true;
  }
  if (parsed.command === "ask") {
    const question = (parsed.rawArgs || []).join(" ").trim();
    if (!question) sendPanel(destination, views.askText(commands.botUsername()), { inline_keyboard: [[{ text: "🏠 Home", callback_data: "nav:home" }]] }, message.message_id);
    else sendPanel(destination, views.escape(assistant.answer(app, question)), { inline_keyboard: [[{ text: "💬 Ask another", callback_data: "nav:ask" }, { text: "🏠 Home", callback_data: "nav:home" }]] }, message.message_id);
    return true;
  }
  return false;
}

function handleNavigation(app, destination, message, parts) {
  const today = planning.today();
  const tomorrow = calendar.addDays(today, 1);
  if (parts[1] === "home") return editHome(app, destination, message);
  if (parts[1] === "meals") return editPanel(destination, message, views.mealsText(), views.mealsKeyboard(today, tomorrow));
  if (parts[1] === "ask") return editPanel(destination, message, views.askText(commands.botUsername()), { inline_keyboard: [[{ text: "🏠 Home", callback_data: "nav:home" }]] });
  if (parts[1] === "settings") return editPanel(destination, message, views.settingsText(destination.getBool("daily_enabled")), views.settingsKeyboard(destination.getBool("daily_enabled")));
  if (parts[1] === "change") return editPanel(destination, message, "✏️ <b>Choose a date</b>", views.dateKeyboard(today));
  if (parts[1] === "day" && parts[2]) return editPanel(destination, message, views.dayText(planning.dayValue(app, parts[2]), parts[2] === today ? "Today" : parts[2] === tomorrow ? "Tomorrow" : "Meal plan"), views.dayKeyboard(parts[2]));
  if (parts[1] === "week") return editPanel(destination, message, views.weekText(planning.weekValue(app, today)), { inline_keyboard: [[{ text: "‹ Meals", callback_data: "nav:meals" }, { text: "🏠 Home", callback_data: "nav:home" }]] });
  if (parts[1] === "saved") {
    const dishes = app.findRecordsByFilter("dishes", "lifecycle = 'want_to_try'", "name", 0, 0);
    return editPanel(destination, message, views.savedRecipesText(dishes), { inline_keyboard: [[{ text: "‹ Meals", callback_data: "nav:meals" }, { text: "🏠 Home", callback_data: "nav:home" }]] });
  }
  return null;
}

function importView(app, destination, message, record) {
  const status = record.getString("status");
  if (status === "saved" && record.getString("dish")) {
    return editPanel(destination, message, views.recipeImportAlreadySavedText(app.findRecordById("dishes", record.getString("dish"))), { inline_keyboard: [[{ text: "🔖 Want to try", callback_data: "nav:saved" }, { text: "🏠 Home", callback_data: "nav:home" }]] });
  }
  if (status === "ready") {
    const extracted = recipeImports.recipe(record);
    return editPanel(destination, message, views.recipeImportPreviewText(extracted, record.getString("platform"), record.getFloat("confidence")), views.recipeImportKeyboard(record, extracted));
  }
  if (status === "needs_input" || status === "failed") {
    return editPanel(destination, message, views.recipeImportNeedsInputText(record.getString("platform"), record.getString("error")), views.recipeImportNeedsInputKeyboard(record));
  }
  if (status === "cancelled") return editPanel(destination, message, views.recipeImportCancelledText(), { inline_keyboard: [[{ text: "🏠 Home", callback_data: "nav:home" }]] });
  return editPanel(destination, message, views.recipeImportAnalyzingText(record.getString("platform")), { inline_keyboard: [] });
}

function handleRecipeCallback(app, destination, query, parts) {
  if (parts.length < 3) return false;
  const record = app.findRecordById("recipe_imports", parts[2]);
  recipeImports.ensureMessage(record, destination, query.message);
  if (parts[1] === "view") {
    importView(app, destination, query.message, record);
    return true;
  }
  if (parts[1] === "cats") {
    if (record.getString("status") !== "ready") throw new Error("recipe_import_not_ready");
    const categories = app.findRecordsByFilter("categories", "", "catId", 0, 0);
    editPanel(destination, query.message, "🧭 <b>Choose the main category</b>\n\nThis controls which dinner rotation dates can suggest the recipe.", views.recipeCategoryKeyboard(record, categories));
    return true;
  }
  if (parts[1] === "details") {
    if (record.getString("status") !== "ready") throw new Error("recipe_import_not_ready");
    editPanel(destination, query.message, views.recipeImportDetailsText(recipeImports.recipe(record), json.arrayField(record, "missing_fields")), { inline_keyboard: [
      [{ text: "‹ Recipe", callback_data: "ri:view:" + record.id }, { text: "🧭 Change category", callback_data: "ri:cats:" + record.id }],
      [{ text: "✖ Cancel", callback_data: "ri:cancel:" + record.id }, { text: "🏠 Home", callback_data: "nav:home" }],
    ] });
    return true;
  }
  if (parts[1] === "cat" && parts[3]) {
    recipeImports.setCategory(app, record, parts[3]);
    importView(app, destination, query.message, app.findRecordById("recipe_imports", record.id));
    return true;
  }
  if (parts[1] === "save") {
    const dish = recipeImports.save(app, record);
    editPanel(destination, query.message, views.recipeImportSavedText(dish), { inline_keyboard: [[{ text: "🔖 Want to try", callback_data: "nav:saved" }, { text: "🏠 Home", callback_data: "nav:home" }]] });
    return true;
  }
  if (parts[1] === "cancel") {
    recipeImports.cancel(app, record);
    importView(app, destination, query.message, app.findRecordById("recipe_imports", record.id));
    return true;
  }
  if (parts[1] === "retry") {
    if (record.getString("status") === "saved" || record.getString("status") === "cancelled") throw new Error("recipe_import_not_retryable");
    editPanel(destination, query.message, views.recipeImportAnalyzingText(record.getString("platform")), { inline_keyboard: [] });
    recipeImports.analyze(app, record);
    importView(app, destination, query.message, app.findRecordById("recipe_imports", record.id));
    return true;
  }
  return false;
}

function handleCallback(app, user, destination, query) {
  const parts = String(query.data || "").split(":");
  try {
    if (parts[0] === "nav") {
      handleNavigation(app, destination, query.message, parts);
      client.answerCallback(query.id, "", false);
      return true;
    }
    if (parts[0] === "ri") {
      const handled = handleRecipeCallback(app, destination, query, parts);
      let notice = parts[1] === "save" ? "Recipe saved" : parts[1] === "cancel" ? "Import cancelled" : "";
      if (handled && parts[1] === "cancel" && app.findRecordById("recipe_imports", parts[2]).getString("status") === "saved") notice = "Recipe was already saved";
      if (handled) client.answerCallback(query.id, notice, false);
      return handled;
    }
    if (parts[0] === "set" && parts[1] === "daily") {
      const enabled = parts[2] === "on";
      destination = state.subscribe(app, destination, enabled);
      editPanel(destination, query.message, views.settingsText(enabled), views.settingsKeyboard(enabled));
      client.answerCallback(query.id, enabled ? "Daily update enabled" : "Daily update disabled", false);
      return true;
    }
    if (parts[0] === "pick" && parts[1] === "date" && parts[2]) {
      assertPlanningDate(parts[2]);
      const title = parts[2] === planning.today() ? "Today" : parts[2] === calendar.addDays(planning.today(), 1) ? "Tomorrow" : "Meal plan";
      editPanel(destination, query.message, views.changeDayText(planning.dayValue(app, parts[2]), title), views.mealKeyboard(parts[2], "pick:meal"));
      client.answerCallback(query.id, "", false);
      return true;
    }
    if (parts[0] === "pick" && parts[1] === "meal" && parts.length === 4) {
      assertPlanningDate(parts[2]);
      calendar.assertMeal(parts[3]);
      editAction(app, destination, query.message, parts[2], parts[3]);
      client.answerCallback(query.id, "", false);
      return true;
    }
    if (parts[0] === "pick" && parts[1] === "cat" && parts.length === 5) {
      assertPlanningDate(parts[2]);
      if (parts[3] !== "dinner") throw new Error("invalid_dinner_category");
      planning.selectDinnerCategory(app, parts[2], parts[4]);
      editAction(app, destination, query.message, parts[2], parts[3]);
      client.answerCallback(query.id, "", false);
      return true;
    }
    if (parts[0] === "do" && parts.length === 4) {
      assertPlanningDate(parts[2]);
      if (parts[1] === "suggest") {
        const slot = planning.slotValue(app, parts[2], parts[3]);
        if (parts[3] === "dinner" && slot.categoryOptions.length > 1 && !slot.category) throw new Error("dinner_category_required");
        const suggestion = planning.generateSuggestions(app, parts[2], [parts[3]])[0];
        showSuggestion(app, destination, query.message, suggestion, false);
        client.answerCallback(query.id, "Suggestion ready", false);
      } else if (parts[1] === "own") {
        calendar.assertMeal(parts[3]);
        client.sendMessage(chatId(destination), views.ownDishText(parts[2], parts[3]), { force_reply: true, selective: true, input_field_placeholder: "Dish name" });
        client.answerCallback(query.id, "Reply with the dish name", false);
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
        assertPlanningDate(suggestion.getString("date"));
        assertSuggestionPending(suggestion);
        planning.acceptSuggestion(app, suggestion.id, user.getString("member"));
        client.answerCallback(query.id, "Meal planned", false);
        markSuggestionSelected(app, destination, query.message, suggestion);
        return true;
      }
      if (parts[1] === "next") {
        assertPlanningDate(suggestion.getString("date"));
        assertSuggestionPending(suggestion);
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
      calendar.parseDate(parts[2]);
      const day = planning.dayValue(app, parts[2]);
      const canRate = calendar.MEALS.some((meal) => day.meals[meal].dish);
      editPanel(
        destination,
        query.message,
        canRate ? "⭐ <b>Choose a meal to rate · " + parts[2] + "</b>" : "⭐ <b>No meals to rate · " + parts[2] + "</b>\n\nOnly meals with a chosen dish can receive feedback.",
        views.feedbackMealKeyboard(day),
      );
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
    query._activityAction = "rejected button action: " + failure;
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
  sendPanel(destination, "📷 Photo saved for <b>" + views.escape(occurrence.getString("date") + " · " + occurrence.getString("meal") + ": " + dish.getString("name")) + "</b>.", { inline_keyboard: [[{ text: "🏠 Home", callback_data: "nav:home" }]] }, message.message_id);
  return true;
}

function handleOwnDish(app, destination, message) {
  const replied = message && message.reply_to_message;
  if (!replied || !commands.replyTargetsBot(message)) return false;
  const target = views.parseOwnDishText(replied.text);
  const name = String(message.text || "").trim();
  if (!target || !name || name.charAt(0) === "/") return false;
  try {
    assertPlanningDate(target.date);
    const assignment = planning.setManualDish(app, target.date, target.meal, name);
    const dish = app.findRecordById("dishes", assignment.getString("dish"));
    sendPanel(destination, views.ownDishSavedText(target.date, target.meal, dish.getString("name")), views.dayKeyboard(target.date), message.message_id);
    message._activityAction = "planned own dish for " + target.date + " " + target.meal;
  } catch (error) {
    const failure = friendlyError(error);
    if (!failure) throw error;
    sendPanel(destination, failure, { inline_keyboard: [[{ text: "🏠 Home", callback_data: "nav:home" }]] }, message.message_id);
    message._activityAction = "rejected own dish: " + failure;
  }
  return true;
}

function handleQuestion(app, destination, message) {
  const question = commands.questionText(message, destination.getString("type"), commands.botUsername());
  if (question === null) return false;
  try {
    const answer = assistant.answer(app, question);
    sendPanel(destination, views.escape(answer), { inline_keyboard: [[{ text: "💬 Ask another", callback_data: "nav:ask" }, { text: "🏠 Home", callback_data: "nav:home" }]] }, message.message_id);
  } catch (error) {
    const failure = friendlyError(error);
    if (!failure) throw error;
    sendPanel(destination, failure, { inline_keyboard: [[{ text: "🏠 Home", callback_data: "nav:home" }]] }, message.message_id);
    message._activityAction = "could not answer question: " + failure;
  }
  return true;
}

function handleRecipeLink(app, user, destination, message) {
  const text = commands.questionText(message, destination.getString("type"), commands.botUsername());
  if (text === null || !/https?:\/\//i.test(text)) return false;
  let rawUrl;
  try {
    rawUrl = recipeUrls.extractFirstUrl(text);
  } catch (_) {
    sendPanel(destination, "I can only import a safe public HTTP or HTTPS recipe link.", { inline_keyboard: [[{ text: "🏠 Home", callback_data: "nav:home" }]] }, message.message_id);
    message._activityAction = "rejected unsafe recipe link";
    return true;
  }
  if (!rawUrl) return false;
  const platform = recipeUrls.platform(rawUrl);
  const response = sendPanel(destination, views.recipeImportAnalyzingText(platform), { inline_keyboard: [] }, message.message_id);
  const record = recipeImports.create(app, rawUrl, user, destination, response.message_id);
  if (record.getString("status") !== "saved") recipeImports.analyze(app, record);
  importView(app, destination, { message_id: response.message_id }, app.findRecordById("recipe_imports", record.id));
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
    activity.received(app, update, chat);
    let handled = false;
    if (kind === "callback_query") handled = handleCallback(app, user, destination, update.callback_query);
    if (kind === "photo") handled = handlePhoto(app, user, destination, update.message);
    if (kind === "message") {
      const parsed = commands.parseCommand(update.message.text);
      handled = parsed
        ? handleCommand(app, user, destination, update.message, parsed)
        : (handleOwnDish(app, destination, update.message)
          || handleRecipeLink(app, user, destination, update.message)
          || handleQuestion(app, destination, update.message));
    }
    finishUpdate(app, updateRecord, handled ? "processed" : "ignored");
    activity.completed(app, update, chat, activity.action(update, handled));
  } catch (error) {
    finishUpdate(app, updateRecord, "failed", safeCode(error));
    const failedChat = security.chatFromUpdate(update);
    if (failedChat) activity.completed(app, update, failedChat, "failed: " + safeCode(error));
    throw error;
  }
}

module.exports = {
  BOT_COMMANDS,
  handle,
  handlePhoto,
  handleRecipeLink,
  helpText,
  registerCommands,
  editHome,
  editPanel,
  sendDaily,
  sendHome,
  sendPanel,
  showSuggestion,
};
