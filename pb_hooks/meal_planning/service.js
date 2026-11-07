"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const json = require(`${__hooks}/shared/json.js`);
const openrouter = require(`${__hooks}/openrouter/client.js`);
const rotationStore = require(`${__hooks}/meal_planning/rotation.js`);
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

function appTimezone() {
  return String($os.getenv("APP_TIMEZONE") || "Europe/Amsterdam");
}

function pad(value) {
  return String(value).length < 2 ? "0" + value : String(value);
}

// The offset of a local calendar day, found by asking the timezone what a
// midday instant on that day looks like there. Noon keeps this clear of the
// (rare, early-morning) instant when a DST transition itself occurs.
function timezoneOffsetMinutes(dateString, timezone) {
  const noon = new DateTime(dateString + " 12:00:00");
  const formatted = noon.time().in(new Timezone(timezone)).format("-07:00");
  const sign = formatted.charAt(0) === "-" ? -1 : 1;
  const hours = Number(formatted.slice(1, 3));
  const minutes = Number(formatted.slice(4, 6));
  return sign * (hours * 60 + minutes);
}

// The absolute instant corresponding to a wall-clock hour:minute on a given
// calendar day in APP_TIMEZONE, as an ISO timestamp needing no further
// timezone logic to compare against.
function localTimestamp(dateString, hour, minute) {
  const offsetMinutes = timezoneOffsetMinutes(dateString, appTimezone());
  const asUtc = Date.parse(dateString + "T" + pad(hour) + ":" + pad(minute) + ":00Z");
  return new Date(asUtc - offsetMinutes * 60 * 1000).toISOString();
}

// The reverse direction: an absolute instant rendered as its local weekday
// and wall-clock time, e.g. "Mon 09:00", for display.
function localWeekdayTime(isoTimestamp) {
  const instant = new DateTime(isoTimestamp);
  return instant.time().in(new Timezone(appTimezone())).format("Mon 15:04");
}

function assignmentFor(app, date, meal) {
  return first(app, "meal_assignments", "date = {:date} && meal = {:meal}", { date, meal });
}

function categoryByCatId(app, catId) {
  return first(app, "categories", "catId = {:catId}", { catId });
}

// The week-parity rule from calendar.js applied to the live rotation table.
function dinnerRotation(app, date) {
  return calendar.dinnerRotation(date, rotationStore.loadTable(app));
}

function effectiveCategory(app, date, meal, assignment) {
  if (assignment && assignment.getString("category")) {
    return optionalById(app, "categories", assignment.getString("category"));
  }
  if (meal !== "dinner") return null;
  const rotation = dinnerRotation(app, date);
  return rotation.kind === "category" ? categoryByCatId(app, rotation.catId) : null;
}

function categoryValue(record) {
  return record ? {
    id: record.id,
    catId: record.getInt("catId"),
    name: record.getString("name_en"),
    nameFa: record.getString("name_fa"),
    emoji: record.getString("emoji"),
    style: record.getString("style"),
    effort: record.getString("effort"),
    effortMinutes: {
      min: record.getInt("effort_min"),
      max: record.getInt("effort_max"),
    },
    weekendOnly: record.getBool("weekend_only"),
    prepAhead: record.getBool("prep_ahead"),
    notes: record.getString("notes") || null,
  } : null;
}

function dishValue(record) {
  return record ? { id: record.id, name: record.getString("name") } : null;
}

function slotValue(app, date, meal) {
  const assignment = assignmentFor(app, date, meal);
  const category = effectiveCategory(app, date, meal, assignment);
  const dish = assignment ? optionalById(app, "dishes", assignment.getString("dish")) : null;
  const rotation = meal === "dinner" ? dinnerRotation(app, date) : null;
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
  const categoryIdByRecordId = {};
  for (const category of app.findRecordsByFilter("categories", "", "catId", 0, 0)) {
    categoryIdByRecordId[category.id] = category.getInt("catId");
  }
  const dishes = app.findRecordsByFilter("dishes", "", "name", 0, 0).map((dish) => {
    const tags = json.arrayField(dish, "tags").slice(0, 20).map((item) => String(item).slice(0, 100));
    const categoryId = dish.getInt("catId") || null;
    const categoryIds = unique([categoryId].concat(
      dish.getStringSlice("categories").map((id) => categoryIdByRecordId[id]),
    ));
    return {
    id: dish.id,
    name: dish.getString("name"),
    categoryId,
    categoryIds,
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
    const categoryIds = requested[meal].category ? [requested[meal].category.catId] : [];
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

function normalizeDishName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 200);
}

function dishByName(app, name) {
  return name ? first(app, "dishes", "name = {:name}", { name }) : null;
}

function dishExists(app, id) {
  return Boolean(optionalById(app, "dishes", id));
}

// A dish the household types in has no recipe behind it, so the model supplies
// the ingredients the shopping list needs. It answers known:false rather than
// inventing a recipe for a name it does not recognise.
function lookupIngredients(date, meal, dishName) {
  const name = normalizeDishName(dishName);
  if (!name) throw new Error("dish_name_required");
  return openrouter.ingredients(name, calendar.servingProfile(date, calendar.assertMeal(meal)));
}

// Shared by setManualDish and setExistingDish: assigns the dish to the slot and
// rejects that slot's pending suggestions. Runs inside the caller's transaction.
function assignDish(tx, date, meal, dish, ingredients, category, current, source) {
  if (ingredients.length) {
    dish.set("ingredients", ingredients);
    tx.save(dish);
  }
  const assignment = current || new Record(tx.findCollectionByNameOrId("meal_assignments"));
  assignment.set("date", date);
  assignment.set("meal", meal);
  assignment.set("dish", dish.id);
  assignment.set("status", "planned");
  assignment.set("selection_source", source);
  if (category) assignment.set("category", category.id);
  tx.save(assignment);
  const pending = tx.findRecordsByFilter("meal_suggestions", "date = {:date} && meal = {:meal} && outcome = 'pending'", "", 0, 0, { date, meal });
  for (const old of pending) {
    old.set("outcome", "rejected");
    old.set("rejection_reason", "manual_choice");
    tx.save(old);
  }
  return assignment.id;
}

function setManualDish(app, date, meal, dishName, ingredients, source) {
  calendar.parseDate(date);
  calendar.assertMeal(meal);
  const name = normalizeDishName(dishName);
  if (!name) throw new Error("dish_name_required");
  const list = Array.isArray(ingredients) ? ingredients : [];
  let assignmentId = "";
  app.runInTransaction((tx) => {
    const current = assignmentFor(tx, date, meal);
    const category = effectiveCategory(tx, date, meal, current);
    const dish = ensureDish(tx, name, category);
    assignmentId = assignDish(tx, date, meal, dish, list, category, current, source || "telegram");
  });
  return app.findRecordById("meal_assignments", assignmentId);
}

// Plans a dish that already exists, by record id.
function setExistingDish(app, date, meal, dishId, ingredients, source) {
  calendar.parseDate(date);
  calendar.assertMeal(meal);
  const list = Array.isArray(ingredients) ? ingredients : [];
  let assignmentId = "";
  app.runInTransaction((tx) => {
    const dish = optionalById(tx, "dishes", dishId);
    if (!dish) throw new Error("dish_not_found");
    const current = assignmentFor(tx, date, meal);
    const category = effectiveCategory(tx, date, meal, current);
    assignmentId = assignDish(tx, date, meal, dish, list, category, current, source || "telegram");
  });
  return app.findRecordById("meal_assignments", assignmentId);
}

function setSpecialStatus(app, date, meal, status, source) {
  calendar.parseDate(date);
  calendar.assertMeal(meal);
  if (["leftovers", "buy_food", "eating_out", "skipped"].indexOf(status) === -1) throw new Error("invalid_status");
  let assignmentId = "";
  app.runInTransaction((tx) => {
    const current = assignmentFor(tx, date, meal);
    const assignment = current || new Record(tx.findCollectionByNameOrId("meal_assignments"));
    const category = effectiveCategory(tx, date, meal, current);
    assignment.set("date", date);
    assignment.set("meal", meal);
    assignment.set("dish", null);
    assignment.set("status", status);
    assignment.set("selection_source", source || "telegram");
    if (category) assignment.set("category", category.id);
    tx.save(assignment);
    assignmentId = assignment.id;
  });
  return app.findRecordById("meal_assignments", assignmentId);
}

// Deletes a slot's assignment unless a cooked occurrence refers to it.
// Returns false (and keeps the assignment) when the slot has history.
function clearAssignment(app, date, meal) {
  calendar.parseDate(date);
  calendar.assertMeal(meal);
  let cleared = true;
  app.runInTransaction((tx) => {
    const assignment = assignmentFor(tx, date, meal);
    if (!assignment) return;
    const history = tx.findRecordsByFilter("cooked_occurrences", "(date = {:date} && meal = {:meal}) || assignment = {:id}", "", 1, 0, { date, meal, id: assignment.id });
    if (history.length || assignment.getString("status") === "cooked") {
      cleared = false;
      return;
    }
    tx.delete(assignment);
  });
  return cleared;
}

// Sets (category record) or removes (null) the per-day category override while
// keeping any planned dish or status. A row created only to carry the override
// is "unplanned"; removing the override from such a row deletes it again.
function setCategoryOverride(app, date, meal, category, source) {
  calendar.parseDate(date);
  calendar.assertMeal(meal);
  app.runInTransaction((tx) => {
    const current = assignmentFor(tx, date, meal);
    if (!category) {
      if (!current) return;
      current.set("category", null);
      if (!current.getString("dish") && (current.getString("status") || "unplanned") === "unplanned") tx.delete(current);
      else tx.save(current);
      return;
    }
    const assignment = current || new Record(tx.findCollectionByNameOrId("meal_assignments"));
    if (!current) {
      assignment.set("date", date);
      assignment.set("meal", meal);
      assignment.set("status", "unplanned");
      assignment.set("selection_source", source || "telegram");
    }
    assignment.set("category", category.id);
    tx.save(assignment);
  });
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

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.domain = true;
  return error;
}

const CATEGORY_STYLES = ["iranian", "international", "either"];
const CATEGORY_EFFORTS = ["quick", "medium", "medium-heavy", "heavy"];
const DISH_DIFFICULTIES = ["easy", "medium", "hard"];
const CATEGORY_TEXT = ["name_en", "name_fa", "emoji", "notes"];
const CATEGORY_FIELDS = CATEGORY_TEXT.concat(["style", "effort", "effort_min", "effort_max", "weekend_only", "prep_ahead"]);
const MAX_MINUTES = 1440;

function invalid(message) {
  return domainError("invalid_params", message);
}

function checkCategoryFields(fields) {
  const out = {};
  for (const key of Object.keys(fields)) {
    if (CATEGORY_FIELDS.indexOf(key) === -1) throw invalid(`unknown field ${key.slice(0, 40)}`);
    const value = fields[key];
    if (value === undefined) continue;
    if (CATEGORY_TEXT.indexOf(key) !== -1) {
      if (typeof value !== "string") throw invalid(`${key} must be a string`);
      out[key] = value.trim();
      if (key !== "notes" && !out[key]) throw invalid(`${key} must not be empty`);
    } else if (key === "style" || key === "effort") {
      const allowed = key === "style" ? CATEGORY_STYLES : CATEGORY_EFFORTS;
      if (allowed.indexOf(value) === -1) throw invalid(`${key} must be one of: ${allowed.join(", ")}`);
      out[key] = value;
    } else if (key === "effort_min" || key === "effort_max") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_MINUTES) {
        throw invalid(`${key} must be an integer between 0 and ${MAX_MINUTES}`);
      }
      out[key] = value;
    } else {
      if (typeof value !== "boolean") throw invalid(`${key} must be a boolean`);
      out[key] = value;
    }
  }
  return out;
}

function sortedCategories(app) {
  return app.findRecordsByFilter("categories", "", "catId", 0, 0);
}

function applyFields(record, fields) {
  for (const key of Object.keys(fields)) record.set(key, fields[key]);
}

// Partial update of one category addressed by its catId; the catId itself is
// never changed. Validation happens before anything is written.
function updateCategory(app, catId, input) {
  if (typeof catId !== "number" || !Number.isInteger(catId)) throw invalid("catId must be an integer");
  if (Object.prototype.hasOwnProperty.call(input, "catId")) throw invalid("catId cannot be changed");
  const fields = checkCategoryFields(input);
  let failure = null;
  let id = "";
  app.runInTransaction((tx) => {
    const record = sortedCategories(tx).find((item) => item.getInt("catId") === catId);
    if (!record) { failure = domainError("not_found", "No category with that catId"); return; }
    const min = fields.effort_min === undefined ? record.getInt("effort_min") : fields.effort_min;
    const max = fields.effort_max === undefined ? record.getInt("effort_max") : fields.effort_max;
    if (min > max) { failure = invalid("effort_min must not be greater than effort_max"); return; }
    applyFields(record, fields);
    tx.save(record);
    id = record.id;
  });
  if (failure) throw failure;
  return app.findRecordById("categories", id);
}

// Creates a category with the next free catId (max + 1). Only name_en is
// required; the other required columns get neutral defaults.
function createCategory(app, input) {
  const fields = checkCategoryFields(input);
  if (!fields.name_en) throw invalid("name_en is required");
  const merged = Object.assign({
    name_fa: fields.name_en, emoji: "🍽️", style: "either", effort: "medium",
    effort_min: 15, effort_max: 60, weekend_only: false, prep_ahead: false, notes: "",
  }, fields);
  if (merged.effort_min > merged.effort_max) throw invalid("effort_min must not be greater than effort_max");
  let id = "";
  app.runInTransaction((tx) => {
    const all = sortedCategories(tx);
    let max = 0;
    for (const item of all) max = Math.max(max, item.getInt("catId"));
    const record = new Record(tx.findCollectionByNameOrId("categories"));
    record.set("catId", max + 1);
    applyFields(record, merged);
    tx.save(record);
    id = record.id;
  });
  return app.findRecordById("categories", id);
}

const DISH_FIELDS = ["id", "name", "catId", "categoryIds", "ingredients", "instructions", "prep_minutes", "cook_minutes", "difficulty", "cuisine", "tags", "notes"];

function stringList(value, key) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw invalid(`${key} must be an array of strings`);
  return value.map((item) => item.trim()).filter(Boolean);
}

function checkDishFields(input) {
  const out = {};
  for (const key of Object.keys(input)) {
    if (DISH_FIELDS.indexOf(key) === -1) throw invalid(`unknown field ${key.slice(0, 40)}`);
    const value = input[key];
    if (value === undefined || key === "id") continue;
    if (key === "name") {
      if (typeof value !== "string") throw invalid("name must be a string");
      out.name = normalizeDishName(value);
      if (!out.name) throw invalid("name must not be empty");
    } else if (key === "catId") {
      if (typeof value !== "number" || !Number.isInteger(value)) throw invalid("catId must be an integer");
      out.catId = value;
    } else if (key === "categoryIds") {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "number" || !Number.isInteger(item))) {
        throw invalid("categoryIds must be an array of integers");
      }
      out.categoryIds = value.filter((item, index) => value.indexOf(item) === index);
    } else if (key === "ingredients" || key === "instructions" || key === "tags") {
      out[key] = stringList(value, key);
    } else if (key === "prep_minutes" || key === "cook_minutes") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_MINUTES) {
        throw invalid(`${key} must be an integer between 0 and ${MAX_MINUTES}`);
      }
      out[key] = value;
    } else if (key === "difficulty") {
      if (DISH_DIFFICULTIES.indexOf(value) === -1) throw invalid(`difficulty must be one of: ${DISH_DIFFICULTIES.join(", ")}`);
      out.difficulty = value;
    } else {
      if (typeof value !== "string") throw invalid(`${key} must be a string`);
      out[key] = value.trim();
      if (key === "cuisine" && out[key].length > 120) throw invalid("cuisine must be at most 120 characters");
    }
  }
  return out;
}

// Creates a dish (no id) or partially updates one (id). A name already used by
// another dish (ignoring case) is refused with name_taken.
function upsertDish(app, input) {
  const hasId = input.id !== undefined;
  if (hasId && (typeof input.id !== "string" || !input.id)) throw invalid("id must be a non-empty string");
  const fields = checkDishFields(input);
  if (!hasId && !fields.name) throw invalid("name is required to create a dish");
  let failure = null;
  let id = "";
  let created = false;
  app.runInTransaction((tx) => {
    const dishes = tx.findRecordsByFilter("dishes", "", "name", 0, 0);
    let record = null;
    if (hasId) {
      record = dishes.find((item) => item.id === input.id);
      if (!record) { failure = domainError("not_found", "No dish with that id"); return; }
    }
    if (fields.name !== undefined) {
      const wanted = fields.name.toLowerCase();
      const clash = dishes.find((item) => item.id !== (record && record.id) && item.getString("name").trim().toLowerCase() === wanted);
      if (clash) { failure = domainError("name_taken", "name_taken: another dish is already named that"); return; }
    }
    const categories = sortedCategories(tx);
    const relationFor = (catId) => categories.find((item) => item.getInt("catId") === catId);
    const relation = [];
    if (fields.categoryIds !== undefined) {
      for (const catId of fields.categoryIds) {
        const category = relationFor(catId);
        if (!category) { failure = invalid(`categoryIds contains unknown catId ${catId}`); return; }
        relation.push(category.id);
      }
    }
    let primary = null;
    if (fields.catId !== undefined) {
      primary = relationFor(fields.catId);
      if (!primary) { failure = invalid(`unknown catId ${fields.catId}`); return; }
    }
    created = !record;
    if (created) {
      record = new Record(tx.findCollectionByNameOrId("dishes"));
      record.set("lifecycle", "regular");
    }
    for (const key of ["name", "ingredients", "instructions", "prep_minutes", "cook_minutes", "difficulty", "cuisine", "tags", "notes"]) {
      if (fields[key] !== undefined) record.set(key, fields[key]);
    }
    if (primary) {
      record.set("catId", primary.getInt("catId"));
      if (fields.categoryIds === undefined && created) relation.push(primary.id);
    }
    if (fields.categoryIds !== undefined || (created && primary)) record.set("categories", relation);
    tx.save(record);
    id = record.id;
  });
  if (failure) throw failure;
  return { record: app.findRecordById("dishes", id), created };
}

module.exports = {
  acceptSuggestion,
  createCategory,
  updateCategory,
  upsertDish,
  assignmentFor,
  categoryByCatId,
  categoryValue,
  clearAssignment,
  dishByName,
  dishExists,
  lookupIngredients,
  normalizeDishName,
  dayIsResolved,
  dayValue,
  effectiveCategory,
  ensureOccurrence,
  generateSuggestions,
  isoNow,
  localTimestamp,
  localWeekdayTime,
  saveFeedback,
  setCategoryOverride,
  setExistingDish,
  setManualDish,
  setSpecialStatus,
  slotValue,
  today,
  weekValue,
};
