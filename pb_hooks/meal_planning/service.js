"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const json = require(`${__hooks}/shared/json.js`);
const openrouter = require(`${__hooks}/openrouter/client.js`);
const preference = require(`${__hooks}/meal_planning/preference.js`);
const prompt = require(`${__hooks}/openrouter/prompt.js`);
const recommendation = require(`${__hooks}/meal_planning/recommendation.js`);

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

function dinnerCategoryOptions(app, date) {
  const rotation = calendar.dinnerRotation(date);
  if (rotation.kind === "category") {
    const category = categoryByCatId(app, rotation.catId);
    return category ? [categoryValue(category)] : [];
  }
  if (rotation.kind === "choice") {
    return rotation.catIds.map((catId) => categoryByCatId(app, catId)).filter(Boolean).map(categoryValue);
  }
  return [];
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
    categoryOptions: meal === "dinner" ? dinnerCategoryOptions(app, date) : [],
    dish: dishValue(dish),
    assignmentId: assignment ? assignment.id : null,
  };
}

function dayValue(app, date) {
  const meals = {};
  for (const meal of calendar.MEALS) meals[meal] = slotValue(app, date, meal);
  return { date, meals };
}

function dayIsResolved(app, date) {
  return calendar.MEALS.every((meal) => {
    const slot = slotValue(app, date, meal);
    return Boolean(slot.dish) || ["leftovers", "buy_food", "eating_out", "skipped"].indexOf(slot.status) !== -1;
  });
}

function weekValue(app, date) {
  const bounds = calendar.weekBounds(date);
  const days = [];
  for (let i = 0; i < 7; i += 1) days.push(dayValue(app, calendar.addDays(bounds.start, i)));
  return { start: bounds.start, end: bounds.end, days };
}

function unique(values) {
  return values.filter((value, index) => Boolean(value) && values.indexOf(value) === index);
}

function suggestedNames(app, fromDate, meal, toDate) {
  return app.findRecordsByFilter(
    "meal_suggestions",
    "meal = {:meal} && date >= {:from} && date <= {:to}",
    "-created",
    30,
    0,
    { meal, from: fromDate, to: toDate },
  ).map((item) => item.getString("suggested_name"));
}

function aiContext(app, targetDate, meals) {
  const week = weekValue(app, targetDate);
  const dishes = app.findRecordsByFilter("dishes", "", "name", 0, 0).map((dish) => {
    const tags = json.arrayField(dish, "tags").slice(0, 20).map((item) => String(item).slice(0, 100));
    return {
    id: dish.id,
    name: dish.getString("name"),
    categoryId: dish.getInt("catId") || null,
    notes: String(dish.getString("notes") || "").slice(0, 500) || null,
    lifecycle: dish.getString("lifecycle") || "regular",
    sourceUrl: dish.getString("source_url") || null,
    sourcePlatform: dish.getString("source_platform") || null,
    ingredients: json.arrayField(dish, "ingredients").slice(0, 20).map((item) => String(item).slice(0, 200)),
    instructions: json.arrayField(dish, "instructions").slice(0, 15).map((item) => String(item).slice(0, 500)),
    prepMinutes: dish.getInt("prep_minutes") || 0,
    cookMinutes: dish.getInt("cook_minutes") || 0,
    difficulty: dish.getString("difficulty") || null,
    cuisine: dish.getString("cuisine") || null,
    tags,
    mealTypes: tags.filter((item) => item.indexOf("meal:") === 0).map((item) => item.slice(5)),
  };
  });
  const feedback = app.findRecordsByFilter("meal_feedback", "", "-created", 100, 0).map((item) => ({
    dishId: item.getString("dish") || null,
    rating: item.getString("rating"),
    makeAgain: item.getString("make_again"),
  }));
  const preferences = app.findRecordsByFilter("household_members", "active = true", "name", 0, 0)
    .map((member) => member.getString("preference_notes"))
    .filter((value) => Boolean(value));
  const occurrences = app.findRecordsByFilter("cooked_occurrences", "date < {:date}", "-date", 200, 0, { date: targetDate })
    .map((item) => ({ dishId: item.getString("dish") || null, date: item.getString("date") }));
  const requested = {};
  const servings = {};
  const candidates = {};
  const avoid = {};
  const assignedDishIds = [];
  for (const day of week.days) {
    for (const meal of calendar.MEALS) {
      const id = day.meals[meal].dish && day.meals[meal].dish.id;
      if (id && assignedDishIds.indexOf(id) === -1) assignedDishIds.push(id);
    }
  }
  for (const meal of meals) {
    requested[meal] = slotValue(app, targetDate, meal);
    servings[meal] = calendar.servingProfile(targetDate, meal);
    const rotation = meal === "dinner" ? calendar.dinnerRotation(targetDate) : null;
    const categoryIds = requested[meal].category
      ? [requested[meal].category.catId]
      : (rotation && rotation.kind === "choice" ? rotation.catIds : []);
    const ranking = { meal, assignedDishIds, categoryIds, feedback, occurrences, targetDate };
    // Anything already shown for this exact slot, plus everything suggested for
    // this meal in the past fortnight: without this the model keeps returning
    // the same top-scored dish every time "Another" is tapped.
    const shown = suggestedNames(app, targetDate, meal, targetDate);
    avoid[meal] = unique(shown.concat(suggestedNames(app, calendar.addDays(targetDate, -14), meal, targetDate)));
    candidates[meal] = recommendation.rankCandidates(dishes, { ...ranking, excludeNames: shown });
    if (!candidates[meal].length) candidates[meal] = recommendation.rankCandidates(dishes, ranking);
  }
  return { targetDate, requested, servings, week, dishes, candidates, avoid, feedback, preferences };
}

function hasEligibleExistingDish(context, meal, dishId) {
  return recommendation.isEligibleCandidate(context.candidates, meal, dishId);
}

function invalidExistingDishSelection(generated, context) {
  return generated.meals.some((item) => !hasEligibleExistingDish(context, item.meal, item.existingDishId));
}

function storedDishDetails(context, item) {
  return recommendation.useStoredDishDetails(context.dishes, item);
}

function generateSuggestions(app, targetDate, meals, requestText) {
  calendar.parseDate(targetDate);
  const requestedMeals = meals.map(calendar.assertMeal);
  const request = String(requestText || "").trim().slice(0, 200);
  const context = aiContext(app, targetDate, requestedMeals);
  const preferences = {};
  const excludedPreferences = {};
  const requestStatus = {};
  for (const meal of requestedMeals) {
    if (!request) continue;
    const category = context.requested[meal] && context.requested[meal].category;
    if (meal === "dinner" && category && !preference.matchesDinnerCategory(request, category, context.dishes)) {
      excludedPreferences[meal] = request;
      requestStatus[meal] = "ignored_category";
    } else {
      preferences[meal] = request;
      requestStatus[meal] = "applied";
    }
  }
  let generated = openrouter.generate(context, requestedMeals, preferences, excludedPreferences);
  let excludedFound = generated.meals.some((item) => (
    excludedPreferences[item.meal]
    && preference.outputContainsRequest(item, excludedPreferences[item.meal])
  ));
  if (invalidExistingDishSelection(generated, context) || excludedFound) {
    generated = openrouter.generate(context, requestedMeals, preferences, excludedPreferences);
    excludedFound = generated.meals.some((item) => (
      excludedPreferences[item.meal]
      && preference.outputContainsRequest(item, excludedPreferences[item.meal])
    ));
    if (invalidExistingDishSelection(generated, context) || excludedFound) throw new Error("invalid_ai_response");
  }
  const stored = [];
  app.runInTransaction((tx) => {
    for (const generatedItem of generated.meals) {
      const item = storedDishDetails(context, generatedItem);
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
      record.set("request_status", requestStatus[item.meal] || "");
      record.set("difficulty", item.difficulty);
      record.set("prep_minutes", item.prepMinutes);
      record.set("cook_minutes", item.cookMinutes);
      record.set("ingredients", item.ingredients);
      record.set("baby_notes", item.babyServing || "");
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
  const existingIngredients = json.arrayField(dish, "ingredients");
  if (!existingIngredients.length) dish.set("ingredients", json.arrayField(suggestion, "ingredients"));
}

function ensureDish(tx, name, category) {
  const existing = first(tx, "dishes", "name = {:name}", { name });
  if (existing) return existing;
  const dish = new Record(tx.findCollectionByNameOrId("dishes"));
  dish.set("name", name);
  dish.set("lifecycle", "regular");
  if (category) {
    dish.set("catId", category.getInt("catId"));
    dish.set("categories", [category.id]);
  }
  tx.save(dish);
  return dish;
}

function upsertAssignment(app, date, meal) {
  return assignmentFor(app, date, meal) || new Record(app.findCollectionByNameOrId("meal_assignments"));
}

function acceptSuggestion(app, suggestionId, memberId) {
  let assignmentId = "";
  app.runInTransaction((tx) => {
    const suggestion = tx.findRecordById("meal_suggestions", suggestionId);
    if (suggestion.getString("outcome") !== "pending") throw new Error("suggestion_not_pending");
    const date = suggestion.getString("date");
    const meal = calendar.assertMeal(suggestion.getString("meal"));
    let dish = optionalById(tx, "dishes", suggestion.getString("dish"));
    const current = assignmentFor(tx, date, meal);
    const category = effectiveCategory(tx, date, meal, current);

    if (!dish) dish = ensureDish(tx, suggestion.getString("suggested_name"), category);
    enrichDishFromSuggestion(dish, suggestion);
    tx.save(dish);

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

function setManualDish(app, date, meal, dishName) {
  calendar.parseDate(date);
  calendar.assertMeal(meal);
  const name = String(dishName || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!name) throw new Error("dish_name_required");
  let assignmentId = "";
  app.runInTransaction((tx) => {
    const current = assignmentFor(tx, date, meal);
    const category = effectiveCategory(tx, date, meal, current);
    const dish = ensureDish(tx, name, category);
    const assignment = current || new Record(tx.findCollectionByNameOrId("meal_assignments"));
    assignment.set("date", date);
    assignment.set("meal", meal);
    assignment.set("dish", dish.id);
    assignment.set("status", "planned");
    assignment.set("selection_source", "telegram");
    if (category) assignment.set("category", category.id);
    tx.save(assignment);
    assignmentId = assignment.id;
    const pending = tx.findRecordsByFilter("meal_suggestions", "date = {:date} && meal = {:meal} && outcome = 'pending'", "", 0, 0, { date, meal });
    for (const old of pending) {
      old.set("outcome", "rejected");
      old.set("rejection_reason", "manual_choice");
      tx.save(old);
    }
  });
  return app.findRecordById("meal_assignments", assignmentId);
}

function setSpecialStatus(app, date, meal, status) {
  calendar.parseDate(date);
  calendar.assertMeal(meal);
  if (["leftovers", "buy_food", "eating_out", "skipped"].indexOf(status) === -1) throw new Error("invalid_status");
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

function selectDinnerCategory(app, date, catId) {
  calendar.parseDate(date);
  const wanted = Number(catId);
  const rotation = calendar.dinnerRotation(date);
  const allowed = rotation.kind === "category"
    ? [rotation.catId]
    : rotation.kind === "choice" ? rotation.catIds : [];
  if (allowed.indexOf(wanted) === -1) throw new Error("invalid_dinner_category");
  const category = categoryByCatId(app, wanted);
  if (!category) throw new Error("invalid_dinner_category");

  const assignment = upsertAssignment(app, date, "dinner");
  const changed = Boolean(assignment.id) && assignment.getString("category") !== category.id;
  assignment.set("date", date);
  assignment.set("meal", "dinner");
  assignment.set("category", category.id);
  if (changed) {
    assignment.set("dish", null);
    assignment.set("status", "unplanned");
  }
  assignment.set("selection_source", "telegram");
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
  dayIsResolved,
  dayValue,
  effectiveCategory,
  ensureOccurrence,
  generateSuggestions,
  isoNow,
  saveFeedback,
  selectDinnerCategory,
  setManualDish,
  setSpecialStatus,
  slotValue,
  today,
  weekValue,
};
