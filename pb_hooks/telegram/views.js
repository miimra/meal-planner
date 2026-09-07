"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const snoozeDurations = require(`${__hooks}/telegram/snooze.js`);

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

// ── Menu state machine ──────────────────────────────────────────────────────
// Several screens have more than one parent (home, meals, the Sunday plan
// message), so a fixed "‹ Back" target lands somewhere unrelated. Every
// planning callback therefore carries one letter naming the screen it was
// opened from, and Back returns there. Buttons in older messages carry no
// letter and fall back to that date's day view.
const ORIGIN_SCREENS = { h: "nav:home", m: "nav:meals", c: "nav:change", w: "nav:planweek" };
const ORIGIN_LABELS = { h: "‹ Home", m: "‹ Meals", c: "‹ Dates", w: "‹ Week plan", d: "‹ Day" };

function origin(value) {
  const code = String(value || "");
  return code.length === 1 && "hmcwd".indexOf(code) !== -1 ? code : "";
}

function withOrigin(data, code) {
  return origin(code) ? data + ":" + origin(code) : data;
}

function originTarget(code, date) {
  return ORIGIN_SCREENS[origin(code)] || (date ? "nav:day:" + date : "nav:meals");
}

function backButton(code, date) {
  return {
    text: ORIGIN_LABELS[origin(code)] || (date ? "‹ Day" : "‹ Meals"),
    callback_data: originTarget(code, date),
  };
}

function homeButton() {
  return { text: "🏠 Home", callback_data: "nav:home" };
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
    "Weekly reminder: <b>" + (dailyEnabled ? "On" : "Off") + "</b>",
  ].join("\n");
}

function homeKeyboard(today, tomorrow, canRateToday, tomorrowDecided, openDinnerCount) {
  const count = Number(openDinnerCount || 0);
  const rows = [
    [{
      text: tomorrowDecided ? "✏️ Change tomorrow" : "✨ Plan tomorrow",
      callback_data: "pick:date:" + tomorrow + ":h",
    }],
    [{
      text: "🗓 Week · " + count + " dinner" + (count === 1 ? "" : "s") + " open",
      callback_data: "nav:planweek:h",
    }],
  ];
  const last = [];
  if (canRateToday) last.push({ text: "⭐ Rate today", callback_data: "fb:date:" + today + ":h" });
  last.push({ text: "••• More", callback_data: "nav:more" });
  rows.push(last);
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

function actionableDinners(week, fromDate) {
  const firstDate = String(fromDate || week.start);
  return week.days.filter((day) => day.date >= firstDate && !decided(day.meals.dinner));
}

function dinnerCategoryLine(slot) {
  if (slot.category) return "\n      🧭 " + escape(slot.category.emoji + " " + slot.category.name);
  if (slot.categoryOptions && slot.categoryOptions.length) {
    return "\n      🧭 " + slot.categoryOptions.map((category) => escape(category.emoji + " " + category.name)).join(" or ");
  }
  return "";
}

function weeklyPlanText(week, heading, fromDate) {
  const open = actionableDinners(week, fromDate);
  const firstDate = String(fromDate || week.start);
  const lines = ["🗓 <b>" + escape(heading) + "</b>", "<i>" + week.start + " → " + week.end + "</i>", ""];
  for (const day of week.days) {
    const slot = day.meals.dinner;
    const name = slot.dish
      ? escape(slot.dish.name)
      : "<i>" + escape(STATUS[slot.status] || STATUS.unplanned) + "</i>";
    const marker = day.date < firstDate ? "·" : decided(slot) ? "✅" : "⬜";
    lines.push(marker + " <b>" + weekdayLabel(day.date) + "</b> " + name + (decided(slot) || day.date < firstDate ? "" : dinnerCategoryLine(slot)));
  }
  lines.push("");
  lines.push(open.length
    ? "<b>" + open.length + " dinner" + (open.length === 1 ? "" : "s") + " still open.</b> Tap a day to plan it."
    : "🌿 <b>Every dinner is planned.</b>");
  return lines.join("\n");
}

function weeklyPlanKeyboard(week, fromDate) {
  const rows = [];
  const days = week.days.filter((day) => day.date >= String(fromDate || week.start));
  for (let index = 0; index < days.length; index += 2) {
    rows.push(days.slice(index, index + 2).map((day) => ({
      text: (decided(day.meals.dinner) ? "✅ " : "") + weekdayLabel(day.date) + " " + day.date.slice(5),
      callback_data: "pick:meal:" + day.date + ":dinner:w",
    })));
  }
  const last = [{ text: "••• More", callback_data: "nav:more" }];
  last.push(homeButton());
  rows.push(last);
  return { inline_keyboard: rows };
}

// The full-week read-only screen is opened from home, from Meals, and from the
// weekly plan message, so its only button pair follows the caller back.
function weekKeyboard(code) {
  return { inline_keyboard: [[backButton(code), homeButton()]] };
}

function nudgeText(week, fromDate) {
  const open = actionableDinners(week, fromDate);
  const days = open.map((day) => weekdayLabel(day.date)).join(", ");
  const count = open.length === 1 ? "one dinner" : open.length + " dinners";
  return "👋 Still need a plan for <b>" + count + "</b>: " + escape(days) + ".\n\nTap a day and let's sort it.";
}

function mealsText() {
  return "🍽 <b>Meals</b>\n\nView the plan or change any slot. Suggestions never alter the plan until you tap <b>Use this</b>.";
}

function mealsKeyboard(today, tomorrow) {
  return { inline_keyboard: [
    [{ text: "Today", callback_data: "nav:day:" + today }, { text: "Tomorrow", callback_data: "nav:day:" + tomorrow }],
    [{ text: "🗓 Plan the week", callback_data: "nav:planweek:m" }],
    [{ text: "📅 This week", callback_data: "nav:week:m" }, { text: "✏️ Change a meal", callback_data: "nav:change" }],
    [{ text: "🔖 Want to try", callback_data: "nav:saved" }],
    [{ text: "🏠 Home", callback_data: "nav:home" }],
  ] };
}

function moreText() {
  return [
    "••• <b>More</b>",
    "",
    "Send a recipe link to save it for later, or type a question as ordinary text.",
  ].join("\n");
}

function moreKeyboard() {
  return { inline_keyboard: [
    [{ text: "🔖 Saved recipes", callback_data: "nav:saved" }],
    [{ text: "📆 Choose another date", callback_data: "nav:change" }],
    [{ text: "🔔 Weekly reminder", callback_data: "nav:settings" }],
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
      row.push({ text: (offset + extra === 0 ? "Today · " : offset + extra === 1 ? "Tomorrow · " : "") + date.slice(5), callback_data: "pick:date:" + date + ":c" });
    }
    rows.push(row);
  }
  rows.push([{ text: "‹ More", callback_data: "nav:more" }, { text: "🏠 Home", callback_data: "nav:home" }]);
  return { inline_keyboard: rows };
}

function mealKeyboard(date, prefix, code) {
  return { inline_keyboard: [
    calendar.MEALS.map((meal) => ({ text: ICONS[meal] + " " + LABELS[meal], callback_data: withOrigin(prefix + ":" + date + ":" + meal, code) })),
    [backButton(code, date), homeButton()],
  ] };
}

function changeDayText(day, title) {
  return dayText(day, title) + "\n\n<b>Which meal do you want to change?</b>";
}

function feedbackMealKeyboard(day, code) {
  const buttons = calendar.MEALS.filter((meal) => day.meals[meal].dish).map((meal) => ({
    text: ICONS[meal] + " " + LABELS[meal] + " · " + String(day.meals[meal].dish.name).slice(0, 24),
    callback_data: withOrigin("fb:meal:" + day.date + ":" + meal, code),
  }));
  const rows = buttons.map((button) => [button]);
  rows.push([backButton(code, day.date), homeButton()]);
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

// Only dinner is planned, so the meal chooser would be a one-button detour and
// the action panel is opened straight from the origin screen; add the chooser
// back into the chain the moment more than one meal is planned again.
function actionBack(date, code) {
  if (calendar.MEALS.length > 1) return { text: "‹ Choose meal", callback_data: withOrigin("pick:date:" + date, code) };
  return backButton(code, date);
}

function actionKeyboard(date, meal, slot, code) {
  const slotData = date + ":" + meal;
  const rows = [];
  if (meal === "dinner" && slot.categoryOptions && slot.categoryOptions.length > 1) {
    rows.push(slot.categoryOptions.map((category) => ({
      text: (slot.category && slot.category.catId === category.catId ? "✅ " : "") + category.emoji + " " + category.name,
      callback_data: withOrigin("pick:cat:" + slotData + ":" + category.catId, code),
    })));
    if (!slot.category) {
      rows.push([actionBack(date, code), homeButton()]);
      return { inline_keyboard: rows };
    }
  }
  rows.push(
    [{ text: "✨ Suggest", callback_data: withOrigin("do:suggest:" + slotData, code) }, { text: "✍️ Enter a dish", callback_data: withOrigin("do:own:" + slotData, code) }],
    [{ text: "🥡 Leftovers", callback_data: withOrigin("do:leftovers:" + slotData, code) }, { text: "••• Not cooking…", callback_data: withOrigin("do:notcooking:" + slotData, code) }],
    [actionBack(date, code), homeButton()],
  );
  return { inline_keyboard: rows };
}

function notCookingText(date, meal) {
  return "🚫 <b>Not cooking · " + escape(date + " · " + LABELS[meal]) + "</b>\n\nWhat should the plan show?";
}

function notCookingKeyboard(date, meal, code) {
  const slotData = date + ":" + meal;
  return { inline_keyboard: [
    [
      { text: "🛒 Buy food", callback_data: withOrigin("do:buy:" + slotData, code) },
      { text: "🍽 Eat out", callback_data: withOrigin("do:out:" + slotData, code) },
    ],
    [{ text: "⏭ Skip", callback_data: withOrigin("do:skip:" + slotData, code) }],
    [{ text: "‹ Planning options", callback_data: withOrigin("pick:meal:" + slotData, code) }, homeButton()],
  ] };
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

// Like the own-dish prompt, this force_reply message carries everything the
// reply needs — dish, date, and meal — so no conversation state is stored.
const INGREDIENTS_PROMPT = /Ingredients for (.+) · (\d{4}-\d{2}-\d{2}) · (Breakfast|Lunch|Dinner)\?/;

function ingredientsPromptText(date, meal, dishName, planned) {
  const head = "🛒 Ingredients for " + escape(dishName) + " · " + date + " · " + LABELS[meal] + "?";
  const body = planned
    ? "It is planned, but I could not look its ingredients up just now. Reply with them, one per line, so I have them on file."
    : "I do not know this dish. Reply with its ingredients, one per line — or open /plan and choose something else. Nothing is planned yet.";
  return head + "\n\n" + body;
}

function parseIngredientsPromptText(text) {
  const match = INGREDIENTS_PROMPT.exec(String(text || ""));
  if (!match) return null;
  const meal = calendar.MEALS.filter((item) => LABELS[item] === match[3])[0];
  return meal ? { name: match[1].trim(), date: match[2], meal } : null;
}

// One per line, or comma separated for people who type it all on one line.
function parseIngredientList(text) {
  return String(text || "")
    .split(/[\n,;]+/)
    .map((item) => item.replace(/^[-•*\s]+/, "").replace(/\s+/g, " ").trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 30);
}

function dayKeyboard(date) {
  return { inline_keyboard: [
    [{ text: "✏️ Change", callback_data: "pick:date:" + date + ":d" }, { text: "⭐ Feedback", callback_data: "fb:date:" + date + ":d" }],
    [{ text: "‹ Meals", callback_data: "nav:meals" }, { text: "🏠 Home", callback_data: "nav:home" }],
  ] };
}

function settingsText(enabled, snoozedUntilLabel) {
  const header = "⚙️ <b>Settings</b>\n\nWeekly dinner reminder, <b>Sunday 14:00 Europe/Amsterdam</b>: <b>" + (enabled ? "On" : "Off") + "</b>\nWhile dinners are still open it follows up hourly between 09:00 and 21:00, and stops as soon as the week is full.";
  const snoozeLine = enabled && snoozedUntilLabel
    ? "\n\n🔕 <b>Notifications paused</b> until <b>" + escape(snoozedUntilLabel) + "</b>."
    : "";
  return header + snoozeLine + "\n\nUse /home for the dashboard, /plan for dinners, and /settings here. Type a question or send a recipe link directly.";
}

function settingsKeyboard(enabled, snoozedUntilLabel) {
  const rows = [];
  if (!enabled) {
    rows.push([{ text: "🔔 Turn weekly reminder on", callback_data: "set:daily:on" }]);
  } else if (snoozedUntilLabel) {
    rows.push([{ text: "▶️ Resume notifications now", callback_data: "set:snooze:off" }]);
  } else {
    rows.push([{ text: "🔕 Turn weekly reminder off", callback_data: "set:daily:off" }]);
    rows.push(snoozeDurations.tokens().map((token) => ({ text: snoozeDurations.label(token), callback_data: "set:snooze:" + token })));
  }
  rows.push([{ text: "🏠 Home", callback_data: "nav:home" }]);
  return { inline_keyboard: rows };
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
  const serving = calendar.servingProfile(suggestion.getString("date"), slot.meal);
  const lines = [
    "🔎 <b>Suggestion details</b>",
    "",
    "<b>" + escape(suggestion.getString("suggested_name")) + "</b>",
    "Serves: <b>" + escape(serving.label) + "</b>",
    "Difficulty: <b>" + escape(suggestion.getString("difficulty")) + "</b>",
    "Time: <b>" + (suggestion.getInt("prep_minutes") + suggestion.getInt("cook_minutes")) + " min</b>",
  ];
  if (suggestion.getString("baby_notes")) lines.push("", "👶 <b>Baby serving</b>\n" + escape(suggestion.getString("baby_notes")));
  return lines.join("\n");
}

function suggestionKeyboard(suggestion, selected, code) {
  const id = suggestion.id;
  const date = suggestion.getString("date");
  const meal = suggestion.getString("meal");
  const rows = [];
  if (!selected) rows.push([
    { text: "✅ Use this", callback_data: withOrigin("sg:use:" + id, code) },
    { text: "🔄 Another", callback_data: withOrigin("sg:next:" + id, code) },
  ]);
  rows.push([
    { text: "🔎 Details", callback_data: withOrigin("sg:details:" + id, code) },
    { text: "✏️ Change", callback_data: withOrigin("pick:meal:" + date + ":" + meal, code) },
  ]);
  rows.push([backButton(code, date), homeButton()]);
  return { inline_keyboard: rows };
}

function suggestionDetailsKeyboard(suggestion, code) {
  const date = suggestion.getString("date");
  return { inline_keyboard: [
    [
      { text: "‹ Suggestion", callback_data: withOrigin("sg:card:" + suggestion.id, code) },
      { text: "✏️ Change", callback_data: withOrigin("pick:meal:" + date + ":" + suggestion.getString("meal"), code) },
    ],
    [backButton(code, date), homeButton()],
  ] };
}

function feedbackKeyboard(assignment, code) {
  const date = assignment.getString("date");
  return { inline_keyboard: [
    [
      { text: "👍 Liked", callback_data: withOrigin("fa:liked:" + assignment.id, code) },
      { text: "😐 Okay", callback_data: withOrigin("fa:okay:" + assignment.id, code) },
      { text: "👎 Disliked", callback_data: withOrigin("fa:disliked:" + assignment.id, code) },
    ],
    [{ text: "‹ Choose meal", callback_data: withOrigin("fb:date:" + date, code) }, homeButton()],
  ] };
}

function feedbackSavedKeyboard(date, code) {
  return { inline_keyboard: [[backButton(code, date), homeButton()]] };
}

module.exports = {
  LABELS,
  actionKeyboard,
  backButton,
  feedbackSavedKeyboard,
  ingredientsPromptText,
  origin,
  originTarget,
  parseIngredientList,
  parseIngredientsPromptText,
  suggestionDetailsKeyboard,
  weekKeyboard,
  withOrigin,
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
  moreKeyboard,
  moreText,
  notCookingKeyboard,
  notCookingText,
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
  actionableDinners,
  openDinners,
};
