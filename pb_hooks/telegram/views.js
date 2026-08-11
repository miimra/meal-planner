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

function suggestionText(suggestion, slot) {
  const category = slot.category
    ? "\n🧭 <b>Main dinner category:</b> " + escape(slot.category.emoji + " " + slot.category.name + (slot.category.nameFa ? " · " + slot.category.nameFa : ""))
    : "";
  const current = slot.dish ? "\nCurrently: " + escape(slot.dish.name) : "";
  const request = suggestion.getString("request_text");
  const requestStatus = suggestion.getString("request_status");
  const prep = suggestion.getInt("prep_minutes");
  const cook = suggestion.getInt("cook_minutes");
  const difficulty = suggestion.getString("difficulty");
  const babyNotes = suggestion.getString("baby_notes");
  const ingredients = json.arrayField(suggestion, "ingredients");
  const details = [
    "👨‍👩‍👶 Serves: <b>2 adults + 1 baby</b>",
    "🥦 <b>Baby-safe · no spicy heat · extra vegetables · low salt &amp; sugar</b>",
    "🧑‍🍳 Difficulty: <b>" + escape(difficulty.charAt(0).toUpperCase() + difficulty.slice(1)) + "</b>",
    "⏱ Time: <b>" + (prep + cook) + " min</b> (" + prep + " prep + " + cook + " cooking)",
  ];
  if (babyNotes) details.push("👶 Baby serving: " + escape(babyNotes));
  if (request) {
    details.unshift(requestStatus === "ignored_category"
      ? "🎯 Requested: <b>" + escape(request) + "</b> · <i>not applied; main category wins</i>"
      : "🎯 Requested: <b>" + escape(request) + "</b>");
  }
  if (ingredients.length) {
    details.push("\n🛒 <b>What you need</b>");
    for (const ingredient of ingredients) details.push("• " + escape(ingredient));
  }
  return [
    ICONS[slot.meal] + " <b>Tomorrow’s " + LABELS[slot.meal].toLowerCase() + "</b>" + category + current,
    "\n<b>" + escape(suggestion.getString("suggested_name")) + "</b>",
    escape(suggestion.getString("reason")),
    "\n" + details.join("\n"),
  ].join("\n");
}

function suggestionKeyboard(suggestion) {
  const id = suggestion.id;
  const date = suggestion.getString("date");
  const meal = suggestion.getString("meal");
  return { inline_keyboard: [
    [
      { text: "✅ Use this", callback_data: "sg:use:" + id },
      { text: "🔄 Another", callback_data: "sg:next:" + id },
    ],
    [
      { text: "↩️ Last meal", callback_data: "act:last:" + date + ":" + meal },
      { text: "🛒 Buy food", callback_data: "act:buy:" + date + ":" + meal },
    ],
    [{ text: "🍽 Eat out", callback_data: "act:out:" + date + ":" + meal }],
  ] };
}

function feedbackKeyboard(assignment) {
  return { inline_keyboard: [[
    { text: "👍 Liked", callback_data: "fa:liked:" + assignment.id },
    { text: "😐 Okay", callback_data: "fa:okay:" + assignment.id },
    { text: "👎 Disliked", callback_data: "fa:disliked:" + assignment.id },
  ]] };
}

function mealPicker(action, date) {
  return { inline_keyboard: [calendar.MEALS.map((meal) => ({
    text: ICONS[meal] + " " + LABELS[meal],
    callback_data: "act:" + action + ":" + date + ":" + meal,
  }))] };
}

module.exports = {
  LABELS,
  dayText,
  escape,
  feedbackKeyboard,
  mealPicker,
  slotLine,
  suggestionKeyboard,
  suggestionText,
  weekText,
};
