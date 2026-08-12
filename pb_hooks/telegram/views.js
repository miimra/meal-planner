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
  buy_food: "Buy food",
  eating_out: "Eat out",
};

function escape(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slotLine(slot) {
  const title = ICONS[slot.meal] + " <b>" + LABELS[slot.meal] + "</b>";
  if (slot.dish) return title + " — " + escape(slot.dish.name);
  return title + " — <i>" + escape(STATUS[slot.status] || STATUS.unplanned) + "</i>";
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
  const todayPlanned = calendar.MEALS.filter((meal) => today.meals[meal].dish).length;
  const tomorrowResolved = calendar.MEALS.filter((meal) => {
    const slot = tomorrow.meals[meal];
    return slot.dish || ["buy_food", "eating_out", "skipped"].indexOf(slot.status) !== -1;
  }).length;
  return [
    "🏠 <b>Household assistant</b>",
    "<i>Europe/Amsterdam · " + today.date + "</i>",
    "",
    "<b>Today</b> · " + todayPlanned + " planned meal" + (todayPlanned === 1 ? "" : "s") + " · feedback is ready below",
    calendar.MEALS.map((meal) => slotLine(today.meals[meal])).join("\n"),
    "",
    "<b>Tomorrow · " + tomorrow.date + "</b> · " + tomorrowResolved + "/3 decisions",
    calendar.MEALS.map((meal) => slotLine(tomorrow.meals[meal])).join("\n"),
    "",
    "Daily 18:30 update: <b>" + (dailyEnabled ? "On" : "Off") + "</b>",
  ].join("\n");
}

function homeKeyboard(today) {
  return { inline_keyboard: [
    [{ text: "🍽 Meals", callback_data: "nav:meals" }, { text: "💬 Ask", callback_data: "nav:ask" }],
    [{ text: "⭐ Today’s feedback", callback_data: "fb:date:" + today }],
    [{ text: "⚙️ Settings", callback_data: "nav:settings" }, { text: "🔄 Refresh", callback_data: "nav:home" }],
  ] };
}

function mealsText() {
  return "🍽 <b>Meals</b>\n\nView the plan or change any slot. Suggestions never alter the plan until you tap <b>Use this</b>.";
}

function mealsKeyboard(today, tomorrow) {
  return { inline_keyboard: [
    [{ text: "Today", callback_data: "nav:day:" + today }, { text: "Tomorrow", callback_data: "nav:day:" + tomorrow }],
    [{ text: "📅 This week", callback_data: "nav:week" }, { text: "✏️ Change a meal", callback_data: "nav:change" }],
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

function actionKeyboard(date, meal) {
  return { inline_keyboard: [
    [{ text: "✨ Suggest", callback_data: "do:suggest:" + date + ":" + meal }, { text: "↩️ Last meal", callback_data: "do:last:" + date + ":" + meal }],
    [{ text: "🛒 Buy", callback_data: "do:buy:" + date + ":" + meal }, { text: "🍽 Eat out", callback_data: "do:out:" + date + ":" + meal }],
    [{ text: "⏭ Skip", callback_data: "do:skip:" + date + ":" + meal }],
    [{ text: "‹ Choose meal", callback_data: "pick:date:" + date }, { text: "🏠 Home", callback_data: "nav:home" }],
  ] };
}

function dayKeyboard(date) {
  return { inline_keyboard: [
    [{ text: "✏️ Change", callback_data: "pick:date:" + date }, { text: "⭐ Feedback", callback_data: "fb:date:" + date }],
    [{ text: "‹ Meals", callback_data: "nav:meals" }, { text: "🏠 Home", callback_data: "nav:home" }],
  ] };
}

function settingsText(enabled) {
  return "⚙️ <b>Settings</b>\n\nDaily dashboard at <b>18:30 Europe/Amsterdam</b>: <b>" + (enabled ? "On" : "Off") + "</b>\n\nUse /home for the dashboard, /meals for planning, /ask for questions, and /settings here.";
}

function settingsKeyboard(enabled) {
  return { inline_keyboard: [
    [{ text: enabled ? "🔕 Turn daily update off" : "🔔 Turn daily update on", callback_data: "set:daily:" + (enabled ? "off" : "on") }],
    [{ text: "🏠 Home", callback_data: "nav:home" }],
  ] };
}

function askText() {
  return "💬 <b>Ask the household assistant</b>\n\nSend your question as ordinary text. In a group, mention <code>@moghassemi_family_assistant_bot</code> or reply to one of my messages.\n\nI can read plans, preferences, feedback, and the next two weeks of dinner categories. Changes still require buttons.";
}

function suggestionCaption(suggestion, slot, selected) {
  const category = slot.category ? "\n🧭 " + escape(slot.category.emoji + " " + slot.category.name) : "";
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
  askText,
  dateKeyboard,
  dayKeyboard,
  dayText,
  escape,
  feedbackKeyboard,
  homeKeyboard,
  homeText,
  mealKeyboard,
  mealsKeyboard,
  mealsText,
  settingsKeyboard,
  settingsText,
  slotLine,
  suggestionCaption,
  suggestionDetails,
  suggestionKeyboard,
  weekText,
};
