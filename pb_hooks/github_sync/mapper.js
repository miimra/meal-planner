"use strict";

function firstByFilter(app, collection, filter, params) {
  const records = app.findRecordsByFilter(collection, filter, "", 1, 0, params || {});
  return records.length ? records[0] : null;
}

function mappingError(message) {
  const error = new Error(message);
  error.name = "SourceMappingError";
  error.status = 422;
  return error;
}

function recipeByExternalId(app, recipeId, required) {
  if (!recipeId) return null;
  const record = firstByFilter(
    app,
    "dishes",
    "github_recipe_id = {:recipeId}",
    { recipeId },
  );
  if (!record && required !== false) throw mappingError(`Unknown recipe id: ${recipeId}`);
  return record;
}

function memberByExternalId(app, memberId, required) {
  if (!memberId) return null;
  const record = firstByFilter(
    app,
    "household_members",
    "external_id = {:memberId}",
    { memberId },
  );
  if (!record && required !== false) throw mappingError(`Unknown household member id: ${memberId}`);
  return record;
}

function matchingCategory(app, label) {
  if (!label) return null;
  const needle = String(label).trim().toLowerCase();
  const available = app.findRecordsByFilter("categories", "", "catId", 0, 0);
  for (const category of available) {
    const english = category.getString("name_en").toLowerCase();
    const persian = category.getString("name_fa").toLowerCase();
    if (
      category.id.toLowerCase() === needle ||
      String(category.getInt("catId")) === needle ||
      english === needle ||
      persian === needle ||
      english.split(/[^a-z0-9]+/).indexOf(needle) !== -1
    ) {
      return category;
    }
  }
  return null;
}

function resolveRecipeCategories(app, labels) {
  const ids = [];
  for (const label of labels) {
    const category = matchingCategory(app, label);
    if (category && ids.indexOf(category.id) === -1) ids.push(category.id);
  }
  return ids;
}

function setRelation(record, field, related) {
  record.set(field, related ? related.id : "");
}

function upsertRecipe(app, data, stats) {
  let record = recipeByExternalId(app, data.id, false);
  const created = !record;
  if (!record) record = new Record(app.findCollectionByNameOrId("dishes"));

  const categoryIds = resolveRecipeCategories(app, data.categories);
  record.set("github_recipe_id", data.id);
  record.set("name", data.name);
  record.set("description", data.description || "");
  record.set("source_categories", data.categories);
  record.set("categories", categoryIds);
  if (categoryIds.length) {
    record.set("catId", app.findRecordById("categories", categoryIds[0]).getInt("catId"));
  } else if (created) {
    record.set("catId", 0);
  }
  record.set("cuisine", data.cuisine || "");
  record.set("servings", data.servings);
  record.set("prep_minutes", data.prepMinutes === null ? 0 : data.prepMinutes);
  record.set("cook_minutes", data.cookMinutes === null ? 0 : data.cookMinutes);
  record.set("ingredients", data.ingredients);
  record.set("source_steps", data.steps);
  record.set("instructions", data.steps.map((step) => step.instruction));
  record.set("reference_photo_metadata", data.referencePhoto);
  record.set("source_created_at", data.createdAt);
  record.set("source_updated_at", data.updatedAt);
  app.save(record);

  stats.recipesUpserted += 1;
  stats[created ? "recipesCreated" : "recipesUpdated"] += 1;
  return record;
}

function upsertHousehold(app, data, commitSha, stats) {
  for (const sourceMember of data.members) {
    let member = memberByExternalId(app, sourceMember.id, false);
    if (!member) {
      member = firstByFilter(
        app,
        "household_members",
        "name = {:name} && external_id = ''",
        { name: sourceMember.name },
      );
    }
    if (!member) member = new Record(app.findCollectionByNameOrId("household_members"));
    member.set("external_id", sourceMember.id);
    member.set("name", sourceMember.name);
    member.set("active", sourceMember.active);
    app.save(member);
    stats.membersUpserted += 1;
  }

  let settings = firstByFilter(
    app,
    "household_settings",
    "source_key = 'github'",
  );
  if (!settings) settings = new Record(app.findCollectionByNameOrId("household_settings"));
  settings.set("source_key", "github");
  settings.set("preferences", data.preferences);
  settings.set("source_commit", commitSha);
  app.save(settings);
  stats.householdsUpserted += 1;
}

function upsertSlot(app, date, mealName, meal, stats) {
  let slot = firstByFilter(
    app,
    "meal_assignments",
    "date = {:date} && meal = {:meal}",
    { date, meal: mealName },
  );
  if (!slot) slot = new Record(app.findCollectionByNameOrId("meal_assignments"));

  const plannedDish = recipeByExternalId(app, meal.plannedRecipeId, true);
  const category = matchingCategory(app, meal.category);
  slot.set("date", date);
  slot.set("meal", mealName);
  slot.set("status", meal.status);
  slot.set("source_category", meal.category || "");
  slot.set("planned_recipe_id", meal.plannedRecipeId || "");
  slot.set("github_managed", true);
  setRelation(slot, "dish", plannedDish);
  setRelation(slot, "category", category);
  app.save(slot);
  stats.mealSlotsUpserted += 1;
  return { plannedDish, slot };
}

function upsertSuggestion(app, date, mealName, source, stats) {
  let suggestion = firstByFilter(
    app,
    "meal_suggestions",
    "external_id = {:id}",
    { id: source.id },
  );
  if (!suggestion) suggestion = new Record(app.findCollectionByNameOrId("meal_suggestions"));
  const dish = recipeByExternalId(app, source.recipeId, true);
  const member = memberByExternalId(app, source.decidedBy, true);
  suggestion.set("external_id", source.id);
  suggestion.set("date", date);
  suggestion.set("meal", mealName);
  suggestion.set("dish", dish.id);
  suggestion.set("suggested_name", dish.getString("name"));
  suggestion.set("suggested_at", source.suggestedAt);
  suggestion.set("outcome", source.status);
  suggestion.set("rejection_reason", source.rejectionReason || "");
  suggestion.set("decided_at", source.decidedAt || "");
  suggestion.set("github_managed", true);
  setRelation(suggestion, "member", member);
  app.save(suggestion);
  stats.suggestionsUpserted += 1;
}

function existingOccurrence(app, date, mealName) {
  return firstByFilter(
    app,
    "cooked_occurrences",
    "date = {:date} && meal = {:meal}",
    { date, meal: mealName },
  );
}

function upsertOccurrence(app, date, mealName, meal, slot, plannedDish, stats) {
  let occurrence = existingOccurrence(app, date, mealName);
  if (!meal.cooked) {
    if (occurrence && occurrence.getBool("github_managed")) {
      occurrence.set("source_present", false);
      app.save(occurrence);
    }
    if (!occurrence && meal.feedback.length) {
      occurrence = new Record(app.findCollectionByNameOrId("cooked_occurrences"));
      occurrence.set("date", date);
      occurrence.set("meal", mealName);
      occurrence.set("assignment", slot.id);
      setRelation(occurrence, "dish", plannedDish);
      occurrence.set("source_recipe_id", meal.plannedRecipeId || "");
      occurrence.set("github_managed", true);
      occurrence.set("source_present", false);
      app.save(occurrence);
    }
    return occurrence;
  }

  if (!occurrence) occurrence = new Record(app.findCollectionByNameOrId("cooked_occurrences"));
  const cookedDish = recipeByExternalId(app, meal.cooked.recipeId, true);
  occurrence.set("date", date);
  occurrence.set("meal", mealName);
  occurrence.set("assignment", slot.id);
  setRelation(occurrence, "dish", cookedDish);
  occurrence.set("source_recipe_id", meal.cooked.recipeId || "");
  occurrence.set("cooked_at", meal.cooked.cookedAt || "");
  occurrence.set("modifications", meal.cooked.changes || "");
  occurrence.set("source_photos", meal.cooked.photos);
  occurrence.set("github_managed", true);
  occurrence.set("source_present", true);
  app.save(occurrence);
  stats.cookedOccurrencesUpserted += 1;
  return occurrence;
}

function upsertFeedback(app, occurrence, plannedDish, source, stats) {
  if (!occurrence) throw mappingError(`Feedback ${source.id} has no cooked occurrence or meal slot`);
  const member = memberByExternalId(app, source.memberId, true);
  let feedback = firstByFilter(
    app,
    "meal_feedback",
    "external_id = {:id}",
    { id: source.id },
  );
  if (!feedback) {
    feedback = firstByFilter(
      app,
      "meal_feedback",
      "occurrence = {:occurrence} && member = {:member} && external_id = ''",
      { occurrence: occurrence.id, member: member.id },
    );
  }
  if (!feedback) feedback = new Record(app.findCollectionByNameOrId("meal_feedback"));
  const dishId = occurrence.getString("dish") || (plannedDish ? plannedDish.id : "");
  feedback.set("external_id", source.id);
  feedback.set("occurrence", occurrence.id);
  feedback.set("dish", dishId);
  feedback.set("member", member.id);
  feedback.set("rating", source.rating);
  feedback.set("make_again", source.makeAgain);
  feedback.set("changes", source.notes || "");
  feedback.set("source_created_at", source.createdAt);
  feedback.set("github_managed", true);
  app.save(feedback);
  stats.feedbackUpserted += 1;
}

function upsertDay(app, data, stats) {
  for (const mealName of ["breakfast", "lunch", "dinner"]) {
    const meal = data.meals[mealName];
    const { plannedDish, slot } = upsertSlot(app, data.date, mealName, meal, stats);
    for (const suggestion of meal.suggestions) {
      upsertSuggestion(app, data.date, mealName, suggestion, stats);
    }
    const occurrence = upsertOccurrence(
      app,
      data.date,
      mealName,
      meal,
      slot,
      plannedDish,
      stats,
    );
    for (const sourceFeedback of meal.feedback) {
      upsertFeedback(app, occurrence, plannedDish, sourceFeedback, stats);
    }
  }
  stats.daysUpserted += 1;
}

function newStats() {
  return {
    householdsUpserted: 0,
    membersUpserted: 0,
    recipesUpserted: 0,
    recipesCreated: 0,
    recipesUpdated: 0,
    daysUpserted: 0,
    mealSlotsUpserted: 0,
    suggestionsUpserted: 0,
    cookedOccurrencesUpserted: 0,
    feedbackUpserted: 0,
  };
}

function applyDocuments(app, documents, commitSha) {
  const stats = newStats();
  const ordered = documents.slice().sort((left, right) => {
    const rank = { household: 0, recipe: 1, day: 2 };
    return rank[left.kind] - rank[right.kind] || left.path.localeCompare(right.path);
  });
  for (const document of ordered) {
    if (document.kind === "household") upsertHousehold(app, document.data, commitSha, stats);
    if (document.kind === "recipe") upsertRecipe(app, document.data, stats);
    if (document.kind === "day") upsertDay(app, document.data, stats);
  }
  return stats;
}

module.exports = {
  applyDocuments,
  matchingCategory,
  memberByExternalId,
  recipeByExternalId,
};
