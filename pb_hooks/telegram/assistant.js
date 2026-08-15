"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const planning = require(`${__hooks}/meal_planning/service.js`);
const openrouter = require(`${__hooks}/openrouter/client.js`);

function optionalById(app, collection, id) {
  if (!id) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function slotFact(app, date, meal) {
  const slot = planning.slotValue(app, date, meal);
  return {
    meal,
    status: slot.status,
    dish: slot.dish ? slot.dish.name : null,
    dinnerCategory: slot.category
      ? slot.category.emoji + " " + slot.category.name
      : slot.categoryOptions.length ? slot.categoryOptions.map((category) => category.emoji + " " + category.name).join(" or ") : null,
  };
}

function context(app) {
  const today = planning.today();
  const days = [];
  for (let offset = 0; offset < 14; offset += 1) {
    const date = calendar.addDays(today, offset);
    days.push({ date, meals: calendar.MEALS.map((meal) => slotFact(app, date, meal)) });
  }
  const preferences = app.findRecordsByFilter("household_members", "active = true", "name", 0, 0).map((member) => ({
    member: member.getString("name"),
    notes: member.getString("preference_notes") || null,
  }));
  const feedback = app.findRecordsByFilter("meal_feedback", "", "-created", 30, 0).map((item) => {
    const dish = optionalById(app, "dishes", item.getString("dish"));
    const member = optionalById(app, "household_members", item.getString("member"));
    return { dish: dish ? dish.getString("name") : null, member: member ? member.getString("name") : null, rating: item.getString("rating") };
  });
  return { timezone: "Europe/Amsterdam", localDate: today, nextFourteenDays: days, householdPreferences: preferences, recentFeedback: feedback };
}

function slotDescription(slot) {
  if (slot.dish) return slot.dish.name;
  const labels = { leftovers: "left over", buy_food: "buy food", eating_out: "eat out", skipped: "skip", cooked: "cooked", planned: "planned", unplanned: "not planned yet" };
  return labels[slot.status] || "not planned yet";
}

function dayDraft(app, label, date) {
  const day = planning.dayValue(app, date);
  return label + " (" + date + "): " + calendar.MEALS.map((meal) => meal + " — " + slotDescription(day.meals[meal])).join("; ") + ".";
}

function todayDraft(app) {
  return dayDraft(app, "Today", planning.today());
}

function tomorrowDraft(app) {
  const date = calendar.addDays(planning.today(), 1);
  return dayDraft(app, "Tomorrow", date);
}

function burgerDraft(app) {
  const today = planning.today();
  for (let offset = 0; offset < 14; offset += 1) {
    const date = calendar.addDays(today, offset);
    const category = planning.slotValue(app, date, "dinner").category;
    if (category && Number(category.catId) === 8) return "The next burger-compatible dinner date is " + date + " (" + category.name + "). No assignment has been changed.";
  }
  return "There is no burger-category dinner date in the next two weeks. No assignment has been changed.";
}

function deterministicDraft(app, question) {
  const value = String(question || "").toLowerCase();
  if (/\b(tomorrow|tomorrow['’]?s)\b/.test(value) && /\b(meal|plan|breakfast|lunch|dinner|eat|food)\b/.test(value)) return tomorrowDraft(app);
  if (/\b(today|today['’]?s|tonight)\b/.test(value) && /\b(meal|plan|breakfast|lunch|dinner|eat|food)\b/.test(value)) return todayDraft(app);
  if (/\bburger|hamburger\b/.test(value) && /\b(when|date|day|next|compatible|fit)\b/.test(value)) return burgerDraft(app);
  return null;
}

function answer(app, question) {
  const safeQuestion = String(question || "").trim().slice(0, 1000);
  if (!safeQuestion) return "Ask me a household or meal-planning question.";
  const draft = deterministicDraft(app, safeQuestion);
  try {
    return openrouter.answer(safeQuestion, context(app), draft);
  } catch (error) {
    if (draft) return draft;
    throw error;
  }
}

module.exports = { answer, burgerDraft, context, deterministicDraft, todayDraft, tomorrowDraft };
