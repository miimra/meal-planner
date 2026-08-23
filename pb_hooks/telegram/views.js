"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const json = require(`${__hooks}/shared/json.js`);

const LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
const ICONS = { breakfast: "☀️", lunch: "🥪", dinner: "🌙" };
const STATUS = {
  unplanned: "Waiting for a plan",
  planned: "Planned",
  cooked: "Cooked",
  skipped: "Skipped",
  leftovers: "Left over",
  buy_food: "Buy food",
  eating_out: "Eat out",
};

function escape(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slotLine(slot) {
  const title = ICONS[slot.meal] + " <b>" + LABELS[slot.meal] + "</b>";
  const value = slot.dish
    ? title + " — " + escape(slot.dish.name)
    : title + " — <i>" + escape(STATUS[slot.status] || STATUS.unplanned) + "</i>";
  if (slot.meal !== "dinner") return value;
  if (slot.category) return value + "\n   🧭 " + escape(slot.category.emoji + " " + slot.category.name);
  if (slot.categoryOptions && slot.categoryOptions.length) {
    return value + "\n   🧭 Choose: " + slot.categoryOptions.map((category) => escape(category.emoji + " " + category.name)).join(" or ");
  }
  return value;
}

function dayText(day, title) {
  return "<b>" + escape(title) + " · " + day.date + "</b>\n\n" + calendar.MEALS.map((meal) => slotLine(day.meals[meal])).join("\n");
}

function weekText(week) {
  const lines = ["<b>This week · " + week.start + " → " + week.end + "</b>"];
  for (const day of week.days) {
    const summary = calendar.MEALS.map((meal) => {
      const slot = day.meals[meal];
      return ICONS[meal] + " " + escape(slot.dish ? slot.dish.name : STATUS[slot.status] || STATUS.unplanned);
    }).join(" · ");
    lines.push("\n<b>" + day.date + "</b>\n" + summary);
  }
  return lines.join("\n");
}

function homeText(today, tomorrow, dailyEnabled) {
  const todayRateable = calendar.MEALS.filter((meal) => today.meals[meal].dish).length;
  const tomorrowResolved = calendar.MEALS.filter((meal) => decided(tomorrow.meals[meal])).length;
  return [
    "🏠 <b>Household assistant</b>",
    "<i>Europe/Amsterdam · " + today.date + "</i>",
    "",
    "<b>Today</b> · " + todayRateable + " meal" + (todayRateable === 1 ? "" : "s") + " available for feedback",
    calendar.MEALS.map((meal) => slotLine(today.meals[meal])).join("\n"),
    "",
    "<b>Tomorrow · " + tomorrow.date + "</b> · " + tomorrowResolved + "/" + calendar.MEALS.length + " decided",
    calendar.MEALS.map((meal) => slotLine(tomorrow.meals[meal])).join("\n"),
    "",
    "Sunday plan message: <b>" + (dailyEnabled ? "On" : "Off") + "</b>",
  ].join("\n");
}

function homeKeyboard(today, tomorrow, canRateToday) {
  const rows = [
    [{ text: "✏️ Plan tomorrow", callback_data: "pick:date:" + tomorrow }, { text: "🍽 Meals", callback_data: "nav:meals" }],
  ];
  if (canRateToday) rows.push([{ text: "⭐ Today’s feedback", callback_data: "fb:date:" + today }]);
  rows.push(
    [{ text: "💬 Ask", callback_data: "nav:ask" }, { text: "📅 This week", callback_data: "nav:week" }],
    [{ text: "⚙️ Settings", callback_data: "nav:settings" }, { text: "🔄 Refresh", callback_data: "nav:home" }],
  );
  return { inline_keyboard: rows };
}

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function decided(slot) {
  return Boolean(slot.dish) || ["leftovers", "buy_food", "eating_out", "skipped"].indexOf(slot.status) !== -1;
}

function planButton(date, slot) {
  const category = slot.meal === "dinner" && slot.category ? " · " + slot.category.name : "";
  return {
    text: (decided(slot) ? "✅ " : "") + ICONS[slot.meal] + " " + LABELS[slot.meal] + category,
    callback_data: "pick:meal:" + date + ":" + slot.meal,
  };
}

function weekdayLabel(date) {
  return WEEKDAY[(calendar.parseDate(date).getUTCDay() + 6) % 7];
}

function openDinners(week) {
  return week.days.filter((day) => !decided(day.meals.dinner));
}

function dinnerCategoryLine(slot) {
  if (slot.category) return "\n      🧭 " + escape(slot.category.emoji + " " + slot.category.name);
  if (slot.categoryOptions && slot.categoryOptions.length) {
    return "\n      🧭 " + slot.categoryOptions.map((category) => escape(category.emoji + " " + category.name)).join(" or ");
  }
  return "";
}

function weeklyPlanText(week, heading) {
  const open = openDinners(week);
  const lines = ["🗓 <b>" + escape(heading) + "</b>", "<i>" + week.start + " → " + week.end + "</i>", ""];
  for (const day of week.days) {
    const slot = day.meals.dinner;
    const name = slot.dish
      ? escape(slot.dish.name)
      : "<i>" + escape(STATUS[slot.status] || STATUS.unplanned) + "</i>";
    lines.push((decided(slot) ? "✅" : "⬜") + " <b>" + weekdayLabel(day.date) + "</b> " + name + (decided(slot) ? "" : dinnerCategoryLine(slot)));
  }
  lines.push("");
  lines.push(open.length
    ? "<b>" + open.length + " dinner" + (open.length === 1 ? "" : "s") + " still open.</b> Tap a day to plan it."
    : "🌿 <b>Every dinner is planned.</b>");
  return lines.join("\n");
}

function weeklyPlanKeyboard(week) {
  const rows = [];
  const open = openDinners(week);
  for (let index = 0; index < open.length; index += 2) {
    rows.push(open.slice(index, index + 2).map((day) => ({
      text: weekdayLabel(day.date) + " " + day.date.slice(5),
      callback_data: "pick:meal:" + day.date + ":dinner",
    })));
  }
  rows.push([{ text: "📅 Full week", callback_data: "nav:week" }, { text: "🏠 Home", callback_data: "nav:home" }]);
  return { inline_keyboard: rows };
}

function nudgeText(week) {
  const open = openDinners(week);
  const days = open.map((day) => weekdayLabel(day.date)).join(", ");
  return "⬜ <b>" + open.length + " dinner" + (open.length === 1 ? "" : "s") + " still open</b>\n" + escape(days) + "\n\nTap a day to pick something.";
}

function mealsText() {
  return "🍽 <b>Meals</b>\n\nView the plan or change any slot. Suggestions never alter the plan until you tap <b>Use this</b>.";
}

function mealsKeyboard(today, tomorrow) {
  return { inline_keyboard: [
    [{ text: "Today", callback_data: "nav:day:" + today }, { text: "Tomorrow", callback_data: "nav:day:" + tomorrow }],
    [{ text: "🗓 Plan the week", callback_data: "nav:planweek" }],
    [{ text: "📅 This week", callback_data: "nav:week" }, { text: "✏️ Change a meal", callback_data: "nav:change" }],
    [{ text: "🔖 Want to try", callback_data: "nav:saved" }],
    [{ text: "🏠 Home", callback_data: "nav:home" }],
  ] };
}

function savedRecipesText(dishes) {
  const lines = ["🔖 <b>Want to try</b>", "", "Recipes saved from links can be suggested when they fit the meal and dinner category."];
  if (!dishes || !dishes.length) {
    lines.push("", "Send me a public recipe, YouTube, or Instagram link to add the first one.");
    return lines.join("\n");
  }
  lines.push("");
  for (const dish of dishes.slice(0, 30)) {
    const platform = dish.getString("source_platform");
    const icon = platform === "youtube" ? "▶️" : platform === "instagram" ? "📸" : "🌐";
    lines.push(icon + " " + escape(dish.getString("name")));
  }
  if (dishes.length > 30) lines.push("", "…and " + (dishes.length - 30) + " more");
  return lines.join("\n");
}

function recipeImportAnalyzingText(platform) {
  const label = platform === "youtube" ? "YouTube link" : platform === "instagram" ? "Instagram link" : "recipe link";
  return "🔎 <b>Analyzing " + label + "</b>\n\nI’m looking for ingredients, instructions, time, and the best household category. Nothing will be saved until you confirm.";
}

function recipeImportPreviewText(recipe, platform, confidence) {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const instructions = Array.isArray(recipe.instructions) ? recipe.instructions : [];
  const lines = [
    "🔖 <b>Recipe found</b>",
    "",
    "<b>" + escape(String(recipe.name || "Untitled recipe").slice(0, 100)) + "</b>",
  ];
  if (recipe.category) lines.push("🧭 " + escape(String(recipe.category).slice(0, 100)));
  const total = Number(recipe.prepMinutes || 0) + Number(recipe.cookMinutes || 0);
  const details = [];
  if (total) details.push("⏱ " + total + " min");
  if (recipe.difficulty) details.push(escape(recipe.difficulty));
  if (recipe.servings) details.push("serves " + escape(recipe.servings));
  if (details.length) lines.push(details.join(" · "));
  if (ingredients.length) {
    lines.push("", "🛒 <b>Ingredients</b>");
    for (const ingredient of ingredients.slice(0, 6)) lines.push("• " + escape(String(ingredient).slice(0, 60)));
    if (ingredients.length > 6) lines.push("• …and " + (ingredients.length - 6) + " more");
  }
  if (instructions.length) lines.push("", "👩‍🍳 " + instructions.length + " instruction" + (instructions.length === 1 ? "" : "s") + " extracted");
  if (recipe.dietaryNotes) lines.push("", "⚠️ " + escape(recipe.dietaryNotes));
  const source = platform === "youtube" ? "YouTube" : platform === "instagram" ? "Instagram" : "Web";
  lines.push("", "Source: " + source + " · Confidence: " + Math.round(Math.max(0, Math.min(1, Number(confidence || 0))) * 100) + "%");
  lines.push("", "Saving adds it to <b>Want to try</b>; it does not schedule a meal.");
  return lines.join("\n");
}

function recipeImportKeyboard(importRecord, recipe) {
  const rows = [];
  if (recipe && recipe.category) rows.push([{ text: "✅ Save to want to try", callback_data: "ri:save:" + importRecord.id }]);
  else rows.push([{ text: "🧭 Choose category to continue", callback_data: "ri:cats:" + importRecord.id }]);
  rows.push(
    [{ text: "🔎 Details", callback_data: "ri:details:" + importRecord.id }, { text: "🧭 Change category", callback_data: "ri:cats:" + importRecord.id }],
    [{ text: "🔄 Retry", callback_data: "ri:retry:" + importRecord.id }],
    [{ text: "✖ Cancel", callback_data: "ri:cancel:" + importRecord.id }, { text: "🏠 Home", callback_data: "nav:home" }],
  );
  return { inline_keyboard: rows };
}

function recipeImportDetailsText(recipe, missingFields) {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const instructions = Array.isArray(recipe.instructions) ? recipe.instructions : [];
  const lines = ["🔎 <b>Imported recipe details</b>", "", "<b>" + escape(String(recipe.name || "Recipe").slice(0, 200)) + "</b>"];
  if (recipe.category) lines.push("Category: <b>" + escape(String(recipe.category).slice(0, 100)) + "</b>");
  function pushWithin(value) {
    if (lines.join("\n").length + value.length + 1 > 3800) return false;
    lines.push(value);
    return true;
  }
  if (ingredients.length) {
    lines.push("", "🛒 <b>Ingredients</b>");
    for (const item of ingredients.slice(0, 20)) if (!pushWithin("• " + escape(String(item).slice(0, 120)))) break;
  }
  if (instructions.length) {
    lines.push("", "👩‍🍳 <b>Instructions</b>");
    for (let index = 0; index < instructions.length && index < 10; index += 1) {
      if (!pushWithin((index + 1) + ". " + escape(String(instructions[index]).slice(0, 240)))) break;
    }
    if (instructions.length > 10) lines.push("…and " + (instructions.length - 10) + " more steps");
  }
  if (missingFields && missingFields.length) lines.push("", "⚠️ Missing or uncertain: " + escape(missingFields.join(", ")));
  return lines.join("\n");
}

function recipeCategoryKeyboard(importRecord, categories) {
  const rows = [];
  for (let index = 0; index < categories.length; index += 2) {
    rows.push(categories.slice(index, index + 2).map((category) => ({
      text: category.getString("emoji") + " " + category.getString("name_en"),
      callback_data: "ri:cat:" + importRecord.id + ":" + category.id,
    })));
  }
  rows.push([{ text: "‹ Recipe", callback_data: "ri:view:" + importRecord.id }, { text: "✖ Cancel", callback_data: "ri:cancel:" + importRecord.id }]);
  return { inline_keyboard: rows };
}

function recipeImportNeedsInputText(platform, reason) {
  const source = platform === "youtube" ? "YouTube" : platform === "instagram" ? "Instagram" : "that page";
  return [
    "📝 <b>I need more recipe information</b>",
    "",
    "I could not reliably extract a complete recipe from " + source + ". " + escape(reason || "The useful details may be inside a video or behind a login."),
    "",
    "Please send a different public recipe link. Support for analyzing forwarded video, screenshots, and pasted captions will be added separately.",
    "",
    "Nothing has been saved.",
  ].join("\n");
}

function recipeImportSavedText(dish) {
  return "✅ <b>Saved to want to try</b>\n\n<b>" + escape(String(dish.getString("name") || "Recipe").slice(0, 200)) + "</b> can now appear in suggestions when it fits the meal and category. No meal was scheduled.";
}

function recipeImportCancelledText() {
  return "✖ <b>Recipe import cancelled</b>\n\nNothing was added to the meal library or plan.";
}

function recipeImportAlreadySavedText(dish) {
  return "🔖 <b>Already saved</b>\n\n<b>" + escape(String(dish.getString("name") || "This recipe").slice(0, 200)) + "</b> is already in Want to try.";
}

function recipeImportNeedsInputKeyboard(importRecord) {
  return { inline_keyboard: [
    [{ text: "🔄 Retry link", callback_data: "ri:retry:" + importRecord.id }, { text: "✖ Cancel", callback_data: "ri:cancel:" + importRecord.id }],
    [{ text: "🏠 Home", callback_data: "nav:home" }],
  ] };
}

function dateKeyboard(today) {
  const rows = [];
  for (let offset = 0; offset < 14; offset += 2) {
    const row = [];
    for (let extra = 0; extra < 2; extra += 1) {
      const date = calendar.addDays(today, offset + extra);
      row.push({ text: (offset + extra === 0 ? "Today · " : offset + extra === 1 ? "Tomorrow · " : "") + date.slice(5), callback_data: "pick:date:" + date });
    }
    rows.push(row);
  }
  rows.push([{ text: "‹ Meals", callback_data: "nav:meals" }, { text: "🏠 Home", callback_data: "nav:home" }]);
  return { inline_keyboard: rows };
}

function mealKeyboard(date, prefix) {
  return { inline_keyboard: [
    calendar.MEALS.map((meal) => ({ text: ICONS[meal] + " " + LABELS[meal], callback_data: prefix + ":" + date + ":" + meal })),
    [{ text: "‹ Back", callback_data: prefix === "pick:meal" ? "nav:change" : "nav:home" }, { text: "🏠 Home", callback_data: "nav:home" }],
  ] };
}

function changeDayText(day, title) {
  return dayText(day, title) + "\n\n<b>Which meal do you want to change?</b>";
}

function feedbackMealKeyboard(day) {
  const buttons = calendar.MEALS.filter((meal) => day.meals[meal].dish).map((meal) => ({
    text: ICONS[meal] + " " + LABELS[meal] + " · " + String(day.meals[meal].dish.name).slice(0, 24),
    callback_data: "fb:meal:" + day.date + ":" + meal,
  }));
  const rows = buttons.map((button) => [button]);
  rows.push([{ text: "🏠 Home", callback_data: "nav:home" }]);
  return { inline_keyboard: rows };
}

function actionText(date, meal, slot) {
  const current = slot.dish ? escape(slot.dish.name) : "<i>" + escape(STATUS[slot.status] || STATUS.unplanned) + "</i>";
  const lines = [
    "✏️ <b>Change " + escape(date + " · " + LABELS[meal]) + "</b>",
    "",
    "Current: <b>" + current + "</b>",
  ];
  if (meal === "dinner") {
    if (slot.category) lines.push("Category: <b>" + escape(slot.category.emoji + " " + slot.category.name) + "</b>");
    else if (slot.categoryOptions && slot.categoryOptions.length) {
      lines.push("Category: <b>choose " + slot.categoryOptions.map((category) => escape(category.emoji + " " + category.name)).join(" or ") + "</b>");
    } else lines.push("Category: <b>no category · eat-out day</b>");
  }
  lines.push("", "The plan changes only when you choose an option or accept a suggestion.");
  return lines.join("\n");
}

function actionKeyboard(date, meal, slot) {
  const rows = [];
  if (meal === "dinner" && slot.categoryOptions && slot.categoryOptions.length > 1) {
    rows.push(slot.categoryOptions.map((category) => ({
      text: (slot.category && slot.category.catId === category.catId ? "✅ " : "") + category.emoji + " " + category.name,
      callback_data: "pick:cat:" + date + ":" + meal + ":" + category.catId,
    })));
    if (!slot.category) {
      rows.push([{ text: "‹ Choose meal", callback_data: "pick:date:" + date }, { text: "🏠 Home", callback_data: "nav:home" }]);
      return { inline_keyboard: rows };
    }
  }
  rows.push(
    [{ text: "✨ Suggest", callback_data: "do:suggest:" + date + ":" + meal }, { text: "✍️ I’ll cook…", callback_data: "do:own:" + date + ":" + meal }],
    [{ text: "🥡 Leftovers", callback_data: "do:leftovers:" + date + ":" + meal }, { text: "🛒 Buy", callback_data: "do:buy:" + date + ":" + meal }],
    [{ text: "🍽 Eat out", callback_data: "do:out:" + date + ":" + meal }, { text: "⏭ Skip", callback_data: "do:skip:" + date + ":" + meal }],
    [{ text: "‹ Choose meal", callback_data: "pick:date:" + date }, { text: "🏠 Home", callback_data: "nav:home" }],
  );
  return { inline_keyboard: rows };
}

// The prompt message carries its own date and meal, so a force_reply round trip
// needs no stored conversation state.
const OWN_DISH_PROMPT = /What are you cooking for (\d{4}-\d{2}-\d{2}) · (Breakfast|Lunch|Dinner)\?/;

function ownDishText(date, meal) {
  return "✍️ What are you cooking for " + date + " · " + LABELS[meal] + "?\n\nReply to this message with the dish name.";
}

function parseOwnDishText(text) {
  const match = OWN_DISH_PROMPT.exec(String(text || ""));
  if (!match) return null;
  const meal = calendar.MEALS.filter((item) => LABELS[item] === match[2])[0];
  return meal ? { date: match[1], meal } : null;
}

function ownDishSavedText(date, meal, dishName) {
  return "✅ <b>" + escape(dishName) + "</b> is planned for " + escape(date + " · " + LABELS[meal]) + ".";
}

function dayKeyboard(date) {
  return { inline_keyboard: [
    [{ text: "✏️ Change", callback_data: "pick:date:" + date }, { text: "⭐ Feedback", callback_data: "fb:date:" + date }],
    [{ text: "‹ Meals", callback_data: "nav:meals" }, { text: "🏠 Home", callback_data: "nav:home" }],
  ] };
}

function settingsText(enabled) {
  return "⚙️ <b>Settings</b>\n\nWeekly dinner plan, <b>Sunday 14:00 Europe/Amsterdam</b>: <b>" + (enabled ? "On" : "Off") + "</b>\nWhile dinners are still open it follows up hourly between 09:00 and 21:00, and stops as soon as the week is full.\n\nUse /home for the dashboard, /meals for planning, /ask for questions, and /settings here.";
}

function settingsKeyboard(enabled) {
  return { inline_keyboard: [
    [{ text: enabled ? "🔕 Turn daily update off" : "🔔 Turn daily update on", callback_data: "set:daily:" + (enabled ? "off" : "on") }],
    [{ text: "🏠 Home", callback_data: "nav:home" }],
  ] };
}

function askText(botUsername) {
  const mention = String(botUsername || "the bot").replace(/^@/, "");
  return "💬 <b>Ask the household assistant</b>\n\nSend your question as ordinary text. In a group, mention <code>@" + escape(mention) + "</code> or reply to one of my messages.\n\nI can read plans, preferences, feedback, and the next two weeks of dinner categories. Changes still require buttons.";
}

function suggestionCaption(suggestion, slot, selected) {
  const category = slot.category
    ? "\n🧭 " + escape(slot.category.emoji + " " + slot.category.name)
    : slot.categoryOptions && slot.categoryOptions.length
      ? "\n🧭 " + slot.categoryOptions.map((item) => escape(item.emoji + " " + item.name)).join(" or ")
      : "";
  return [
    ICONS[slot.meal] + " <b>" + escape(suggestion.getString("date")) + " · " + LABELS[slot.meal] + "</b>" + (selected ? " · ✅ Selected" : "") + category,
    "",
    "<b>" + escape(suggestion.getString("suggested_name")) + "</b>",
    escape(suggestion.getString("reason")),
    "⏱ " + (suggestion.getInt("prep_minutes") + suggestion.getInt("cook_minutes")) + " min · " + escape(suggestion.getString("difficulty")),
  ].join("\n").slice(0, 1000);
}

function suggestionDetails(suggestion, slot) {
  const ingredients = json.arrayField(suggestion, "ingredients");
  const serving = calendar.servingProfile(suggestion.getString("date"), slot.meal);
  const lines = [
    "🔎 <b>Suggestion details</b>",
    "",
    "<b>" + escape(suggestion.getString("suggested_name")) + "</b>",
    "Serves: <b>" + escape(serving.label) + "</b>",
    "Difficulty: <b>" + escape(suggestion.getString("difficulty")) + "</b>",
    "Time: <b>" + (suggestion.getInt("prep_minutes") + suggestion.getInt("cook_minutes")) + " min</b>",
  ];
  if (ingredients.length) lines.push("", "🛒 <b>Ingredients</b>", ingredients.map((item) => "• " + escape(item)).join("\n"));
  if (suggestion.getString("baby_notes")) lines.push("", "👶 <b>Baby serving</b>\n" + escape(suggestion.getString("baby_notes")));
  return lines.join("\n");
}

function suggestionKeyboard(suggestion, selected) {
  const id = suggestion.id;
  const date = suggestion.getString("date");
  const meal = suggestion.getString("meal");
  const rows = [];
  if (!selected) rows.push([
    { text: "✅ Use this", callback_data: "sg:use:" + id },
    { text: "🔄 Another", callback_data: "sg:next:" + id },
  ]);
  rows.push([{ text: "🔎 Details", callback_data: "sg:details:" + id }, { text: "✏️ Change", callback_data: "pick:meal:" + date + ":" + meal }]);
  rows.push([{ text: "🏠 Home", callback_data: "nav:home" }]);
  return { inline_keyboard: rows };
}

function feedbackKeyboard(assignment) {
  return { inline_keyboard: [
    [{ text: "👍 Liked", callback_data: "fa:liked:" + assignment.id }, { text: "😐 Okay", callback_data: "fa:okay:" + assignment.id }, { text: "👎 Disliked", callback_data: "fa:disliked:" + assignment.id }],
    [{ text: "🏠 Home", callback_data: "nav:home" }],
  ] };
}

module.exports = {
  LABELS,
  actionKeyboard,
  actionText,
  askText,
  changeDayText,
  dateKeyboard,
  dayKeyboard,
  dayText,
  decided,
  escape,
  feedbackKeyboard,
  feedbackMealKeyboard,
  homeKeyboard,
  homeText,
  mealKeyboard,
  mealsKeyboard,
  mealsText,
  ownDishSavedText,
  ownDishText,
  parseOwnDishText,
  recipeCategoryKeyboard,
  recipeImportAnalyzingText,
  recipeImportAlreadySavedText,
  recipeImportCancelledText,
  recipeImportDetailsText,
  recipeImportKeyboard,
  recipeImportNeedsInputKeyboard,
  recipeImportNeedsInputText,
  recipeImportPreviewText,
  recipeImportSavedText,
  savedRecipesText,
  settingsKeyboard,
  settingsText,
  slotLine,
  suggestionCaption,
  suggestionDetails,
  suggestionKeyboard,
  weekText,
  weekdayLabel,
  weeklyPlanKeyboard,
  weeklyPlanText,
  nudgeText,
  openDinners,
};
