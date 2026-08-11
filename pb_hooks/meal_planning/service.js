"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const openrouter = require(`${__hooks}/openrouter/client.js`);
const prompt = require(`${__hooks}/openrouter/prompt.js`);

function first(app, collection, filter, params, sort) {
  const records = app.findRecordsByFilter(collection, filter, sort || "", 1, 0, params || {});
  return records.length ? records[0] : null;
}

function optionalById(app, collection, id) {
  if (!id) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function nowLocal() {
  const timezone = String($os.getenv("APP_TIMEZONE") || "Europe/Amsterdam");
  return new DateTime().time().in(new Timezone(timezone));
}

function today() {
  return nowLocal().format("2006-01-02");
}

function isoNow() {
  return nowLocal().format("2006-01-02T15:04:05-07:00");
}

function assignmentFor(app, date, meal) {
  return first(app, "meal_assignments", "date = {:date} && meal = {:meal}", { date, meal });
}

function categoryByCatId(app, catId) {
  return first(app, "categories", "catId = {:catId}", { catId });
}

function effectiveCategory(app, date, meal, assignment) {
  if (assignment && assignment.getString("category")) {
    return optionalById(app, "categories", assignment.getString("category"));
  }
  if (meal !== "dinner") return null;
  const rotation = calendar.dinnerRotation(date);
  return rotation.kind === "category" ? categoryByCatId(app, rotation.catId) : null;
}

function categoryValue(record) {
  return record ? {
    id: record.id,
    catId: record.getInt("catId"),
    name: record.getString("name_en"),
    nameFa: record.getString("name_fa"),
    emoji: record.getString("emoji"),
  } : null;
}

function dishValue(record) {
  return record ? { id: record.id, name: record.getString("name") } : null;
}

function slotValue(app, date, meal) {
  const assignment = assignmentFor(app, date, meal);
  const category = effectiveCategory(app, date, meal, assignment);
  const dish = assignment ? optionalById(app, "dishes", assignment.getString("dish")) : null;
  const rotation = meal === "dinner" ? calendar.dinnerRotation(date) : null;
  let status = assignment ? assignment.getString("status") || (dish ? "planned" : "unplanned") : "unplanned";
  if (!assignment && rotation && rotation.kind === "eat_out") status = "eating_out";
  return {
    meal,
    status,
    selectionSource: assignment ? assignment.getString("selection_source") || null : null,
    category: categoryValue(category),
    dish: dishValue(dish),
    assignmentId: assignment ? assignment.id : null,
  };
}

function dayValue(app, date) {
  const meals = {};
  for (const meal of calendar.MEALS) meals[meal] = slotValue(app, date, meal);
  return { date, meals };
}

function weekValue(app, date) {
  const bounds = calendar.weekBounds(date);
  const days = [];
  for (let i = 0; i < 7; i += 1) days.push(dayValue(app, calendar.addDays(bounds.start, i)));
  return { start: bounds.start, end: bounds.end, days };
}

function aiContext(app, targetDate, meals) {
  const week = weekValue(app, targetDate);
  const dishes = app.findRecordsByFilter("dishes", "", "name", 0, 0).map((dish) => ({
    id: dish.id,
    name: dish.getString("name"),
    categoryId: dish.getInt("catId") || null,
    notes: dish.getString("notes") || null,
  }));
  const feedback = app.findRecordsByFilter("meal_feedback", "", "-created", 100, 0).map((item) => ({
    dishId: item.getString("dish") || null,
    rating: item.getString("rating"),
    makeAgain: item.getString("make_again"),
  }));
  const preferences = app.findRecordsByFilter("household_members", "active = true", "name", 0, 0)
    .map((member) => member.getString("preference_notes"))
    .filter((value) => Boolean(value));
  const rejected = app.findRecordsByFilter(
    "meal_suggestions",
    "date = {:date} && outcome = 'rejected'",
    "-created",
    50,
    0,
    { date: targetDate },
  ).map((item) => ({ meal: item.getString("meal"), name: item.getString("suggested_name") }));
  const requested = {};
  for (const meal of meals) requested[meal] = slotValue(app, targetDate, meal);
  return { targetDate, requested, week, dishes, feedback, preferences, rejected };
}

function generateSuggestions(app, targetDate, meals, requestText) {
  calendar.parseDate(targetDate);
  const requestedMeals = meals.map(calendar.assertMeal);
  const request = String(requestText || "").trim().slice(0, 200);
  const preferences = {};
  if (request) {
    for (const meal of requestedMeals) preferences[meal] = request;
  }
  const generated = openrouter.generate(aiContext(app, targetDate, requestedMeals), requestedMeals, preferences);
  const stored = [];
  app.runInTransaction((tx) => {
    for (const item of generated.meals) {
      const pending = tx.findRecordsByFilter(
        "meal_suggestions",
        "date = {:date} && meal = {:meal} && outcome = 'pending'",
        "",
        0,
        0,
        { date: targetDate, meal: item.meal },
      );
      for (const old of pending) {
        old.set("outcome", "rejected");
        old.set("rejection_reason", "replaced");
        tx.save(old);
      }

      const record = new Record(tx.findCollectionByNameOrId("meal_suggestions"));
      record.set("date", targetDate);
      record.set("meal", item.meal);
      const dish = optionalById(tx, "dishes", item.existingDishId);
      if (dish) record.set("dish", dish.id);
      record.set("suggested_name", item.name);
      record.set("outcome", "pending");
      record.set("reason", item.reason);
      record.set("request_text", request);
      record.set("difficulty", item.difficulty);
      record.set("prep_minutes", item.prepMinutes);
      record.set("cook_minutes", item.cookMinutes);
      record.set("ingredients", item.ingredients);
      record.set("model", generated.model);
      record.set("prompt_version", prompt.PROMPT_VERSION);
      tx.save(record);
      stored.push(record);
    }
  });
  return stored;
}

function enrichDishFromSuggestion(dish, suggestion) {
  if (!dish.getString("difficulty")) dish.set("difficulty", suggestion.getString("difficulty"));
  if (!dish.getInt("prep_minutes")) dish.set("prep_minutes", suggestion.getInt("prep_minutes"));
  if (!dish.getInt("cook_minutes")) dish.set("cook_minutes", suggestion.getInt("cook_minutes"));
  const existingIngredients = dish.get("ingredients");
  if (!existingIngredients || !existingIngredients.length) dish.set("ingredients", suggestion.get("ingredients"));
}

function upsertAssignment(app, date, meal) {
  return assignmentFor(app, date, meal) || new Record(app.findCollectionByNameOrId("meal_assignments"));
}

function acceptSuggestion(app, suggestionId, memberId) {
  let assignmentId = "";
  app.runInTransaction((tx) => {
    const suggestion = tx.findRecordById("meal_suggestions", suggestionId);
    const date = suggestion.getString("date");
    const meal = calendar.assertMeal(suggestion.getString("meal"));
    let dish = optionalById(tx, "dishes", suggestion.getString("dish"));
    const current = assignmentFor(tx, date, meal);
    const category = effectiveCategory(tx, date, meal, current);

    if (!dish) {
      dish = first(tx, "dishes", "name = {:name}", { name: suggestion.getString("suggested_name") });
    }
    if (!dish) {
      dish = new Record(tx.findCollectionByNameOrId("dishes"));
      dish.set("name", suggestion.getString("suggested_name"));
      if (category) {
        dish.set("catId", category.getInt("catId"));
        dish.set("categories", [category.id]);
      }
      enrichDishFromSuggestion(dish, suggestion);
      tx.save(dish);
    } else {
      enrichDishFromSuggestion(dish, suggestion);
      tx.save(dish);
    }

    const assignment = current || new Record(tx.findCollectionByNameOrId("meal_assignments"));
    assignment.set("date", date);
    assignment.set("meal", meal);
    assignment.set("dish", dish.id);
    assignment.set("status", "planned");
    assignment.set("selection_source", "ai");
    if (category) assignment.set("category", category.id);
    tx.save(assignment);
    assignmentId = assignment.id;

    suggestion.set("dish", dish.id);
    suggestion.set("outcome", "accepted");
    if (memberId) suggestion.set("member", memberId);
    tx.save(suggestion);
  });
  return app.findRecordById("meal_assignments", assignmentId);
}

function setSpecialStatus(app, date, meal, status) {
  calendar.parseDate(date);
  calendar.assertMeal(meal);
  if (["buy_food", "eating_out", "skipped"].indexOf(status) === -1) throw new Error("invalid_status");
  const assignment = upsertAssignment(app, date, meal);
  const category = effectiveCategory(app, date, meal, assignment.id ? assignment : null);
  assignment.set("date", date);
  assignment.set("meal", meal);
  assignment.set("dish", null);
  assignment.set("status", status);
  assignment.set("selection_source", "telegram");
  if (category) assignment.set("category", category.id);
  app.save(assignment);
  return assignment;
}

function useLastMeal(app, date, meal) {
  calendar.parseDate(date);
  calendar.assertMeal(meal);
  let source = first(app, "cooked_occurrences", "meal = {:meal} && date < {:date} && dish != ''", { meal, date }, "-date");
  let dishId = source ? source.getString("dish") : "";
  if (!dishId) {
    source = first(app, "meal_assignments", "meal = {:meal} && date < {:date} && dish != ''", { meal, date }, "-date");
    dishId = source ? source.getString("dish") : "";
  }
  const dish = optionalById(app, "dishes", dishId);
  if (!dish) throw new Error("no_last_meal");
  const assignment = upsertAssignment(app, date, meal);
  const category = effectiveCategory(app, date, meal, assignment.id ? assignment : null);
  assignment.set("date", date);
  assignment.set("meal", meal);
  assignment.set("dish", dish.id);
  assignment.set("status", "planned");
  assignment.set("selection_source", "last_meal");
  if (category) assignment.set("category", category.id);
  app.save(assignment);
  return assignment;
}

function ensureOccurrence(app, date, meal) {
  let occurrence = first(app, "cooked_occurrences", "date = {:date} && meal = {:meal}", { date, meal });
  const assignment = assignmentFor(app, date, meal);
  if (!assignment || !assignment.getString("dish")) return null;
  if (!occurrence) occurrence = new Record(app.findCollectionByNameOrId("cooked_occurrences"));
  occurrence.set("date", date);
  occurrence.set("meal", meal);
  occurrence.set("assignment", assignment.id);
  occurrence.set("dish", assignment.getString("dish"));
  app.save(occurrence);
  return occurrence;
}

function saveFeedback(app, occurrenceId, memberId, rating) {
  const mapping = { liked: "yes", okay: "maybe", disliked: "no" };
  if (!mapping[rating]) throw new Error("invalid_rating");
  const occurrence = app.findRecordById("cooked_occurrences", occurrenceId);
  let feedback = first(app, "meal_feedback", "occurrence = {:occurrence} && member = {:member}", { occurrence: occurrenceId, member: memberId });
  if (!feedback) feedback = new Record(app.findCollectionByNameOrId("meal_feedback"));
  feedback.set("occurrence", occurrenceId);
  feedback.set("dish", occurrence.getString("dish"));
  feedback.set("member", memberId);
  feedback.set("rating", rating);
  feedback.set("make_again", mapping[rating]);
  app.save(feedback);
  const assignment = optionalById(app, "meal_assignments", occurrence.getString("assignment"));
  if (assignment) {
    assignment.set("status", "cooked");
    app.save(assignment);
  }
  return feedback;
}

module.exports = {
  acceptSuggestion,
  assignmentFor,
  dayValue,
  effectiveCategory,
  ensureOccurrence,
  generateSuggestions,
  isoNow,
  saveFeedback,
  setSpecialStatus,
  slotValue,
  today,
  useLastMeal,
  weekValue,
};
