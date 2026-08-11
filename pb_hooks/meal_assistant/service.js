"use strict";

const lib = require(`${__hooks}/meal_assistant/lib.js`);

function body(e) {
  return e.requestInfo().body || {};
}

function optionalRecordById(app, collection, id) {
  if (!id) return null;
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

function firstByFilter(app, collection, filter, params) {
  const records = app.findRecordsByFilter(collection, filter, "", 1, 0, params || {});
  return records.length ? records[0] : null;
}

function jsonField(record, name, fallback) {
  const raw = record.get(name);
  if (raw === null || typeof raw === "undefined") return fallback;
  const text = toString(raw);
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return parsed === null ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

function fileUrl(record, filename) {
  if (!filename) return null;
  const kind = record.collection().name === "dish_reference_photos" ? "reference" : "cooked";
  return "/api/meal-assistant/photo/" + kind + "/" + record.id + "/" + encodeURIComponent(filename);
}

function categoryJson(record) {
  if (!record) return null;
  return {
    id: record.id,
    catId: record.getInt("catId"),
    name: record.getString("name_en"),
    nameFa: record.getString("name_fa"),
    emoji: record.getString("emoji"),
    style: record.getString("style"),
    effort: record.getString("effort"),
    effortMinutes: [record.getInt("effort_min"), record.getInt("effort_max")],
    notes: record.getString("notes") || null,
  };
}

function categoriesForDish(app, dish) {
  const result = [];
  const ids = dish.getStringSlice("categories");
  for (const id of ids) {
    const category = optionalRecordById(app, "categories", id);
    if (category) result.push(categoryJson(category));
  }
  return result;
}

function dishJson(app, dish) {
  if (!dish) return null;
  const referenceRecord = firstByFilter(
    app,
    "dish_reference_photos",
    "dish = {:dish}",
    { dish: dish.id },
  );
  const referencePhoto = referenceRecord ? referenceRecord.getString("photo") : "";
  return {
    id: dish.id,
    githubRecipeId: dish.getString("github_recipe_id") || null,
    name: dish.getString("name"),
    description: dish.getString("description") || null,
    servings: dish.getFloat("servings") || null,
    legacyCategoryId: dish.getInt("catId") || null,
    categories: categoriesForDish(app, dish),
    sourceCategories: jsonField(dish, "source_categories", []),
    recipe: {
      ingredients: jsonField(dish, "ingredients", []),
      instructions: jsonField(dish, "instructions", []),
      prepMinutes: dish.getInt("prep_minutes") || 0,
      cookMinutes: dish.getInt("cook_minutes") || 0,
      sourceSteps: jsonField(dish, "source_steps", []),
    },
    difficulty: dish.getString("difficulty") || null,
    cuisine: dish.getString("cuisine") || null,
    tags: jsonField(dish, "tags", []),
    notes: dish.getString("notes") || null,
    referencePhoto: referencePhoto ? {
      filename: referencePhoto,
      url: fileUrl(referenceRecord, referencePhoto),
    } : null,
    sourceReferencePhoto: jsonField(dish, "reference_photo_metadata", null),
    created: dish.getString("created") || null,
    updated: dish.getString("updated") || null,
  };
}

function assignmentJson(app, record) {
  if (!record) return null;
  const dish = optionalRecordById(app, "dishes", record.getString("dish"));
  const category = optionalRecordById(app, "categories", record.getString("category"));
  return {
    id: record.id,
    date: record.getString("date"),
    meal: record.getString("meal"),
    status: record.getString("status") || null,
    sourceCategory: record.getString("source_category") || null,
    plannedRecipeId: record.getString("planned_recipe_id") || null,
    category: categoryJson(category),
    dish: dishJson(app, dish),
    notes: record.getString("notes") || null,
    created: record.getString("created"),
    updated: record.getString("updated"),
  };
}

function occurrenceJson(app, record) {
  if (!record) return null;
  const photos = [];
  for (const filename of record.getStringSlice("photos")) {
    photos.push({ filename, url: fileUrl(record, filename) });
  }
  return {
    id: record.id,
    date: record.getString("date"),
    meal: record.getString("meal"),
    cookedAt: record.getString("cooked_at") || null,
    sourceRecipeId: record.getString("source_recipe_id") || null,
    assignmentId: record.getString("assignment") || null,
    dish: dishJson(app, optionalRecordById(app, "dishes", record.getString("dish"))),
    photos,
    sourcePhotos: jsonField(record, "source_photos", []),
    modifications: record.getString("modifications") || null,
    notes: record.getString("notes") || null,
    created: record.getString("created"),
    updated: record.getString("updated"),
  };
}

function memberJson(record) {
  if (!record) return null;
  return {
    id: record.id,
    externalId: record.getString("external_id") || null,
    name: record.getString("name"),
    active: record.getBool("active"),
    preferenceNotes: record.getString("preference_notes") || null,
  };
}

function feedbackJson(app, record) {
  if (!record) return null;
  return {
    id: record.id,
    externalId: record.getString("external_id") || null,
    occurrenceId: record.getString("occurrence"),
    dish: dishJson(app, optionalRecordById(app, "dishes", record.getString("dish"))),
    member: memberJson(optionalRecordById(app, "household_members", record.getString("member"))),
    rating: record.getString("rating"),
    makeAgain: record.getString("make_again"),
    changes: record.getString("changes") || null,
    sourceCreatedAt: record.getString("source_created_at") || null,
    created: record.getString("created"),
    updated: record.getString("updated"),
  };
}

function suggestionJson(app, record) {
  return {
    id: record.id,
    externalId: record.getString("external_id") || null,
    date: record.getString("date"),
    meal: record.getString("meal"),
    dish: dishJson(app, optionalRecordById(app, "dishes", record.getString("dish"))),
    suggestedName: record.getString("suggested_name") || null,
    outcome: record.getString("outcome"),
    suggestedAt: record.getString("suggested_at") || null,
    decidedAt: record.getString("decided_at") || null,
    rejectionReason: record.getString("rejection_reason") || null,
    member: memberJson(optionalRecordById(app, "household_members", record.getString("member"))),
    created: record.getString("created"),
  };
}

function context(e) {
  e.response.header().set("Cache-Control", "no-store");

  const timezone = "Europe/Amsterdam";
  const now = new DateTime().time().in(new Timezone(timezone));
  const generatedAt = now.format("2006-01-02T15:04:05-07:00");
  const todayDate = now.format("2006-01-02");
  const query = e.request.url.query();
  const targetDate = query.has("date") ? query.get("date") : lib.addDays(todayDate, 1);
  lib.parseDate(targetDate);
  const bounds = lib.weekBounds(targetDate);
  const fromDate = todayDate < bounds.start ? todayDate : bounds.start;
  const toDate = todayDate > bounds.end ? todayDate : bounds.end;

  const assignments = e.app.findRecordsByFilter(
    "meal_assignments",
    "date >= {:from} && date <= {:to}",
    "date,meal",
    0,
    0,
    { from: fromDate, to: toDate },
  );

  const categoriesById = {};
  const categoriesByCatId = {};
  const categoryRecords = e.app.findRecordsByFilter("categories", "", "catId", 0, 0);
  for (const category of categoryRecords) {
    categoriesById[category.id] = category;
    categoriesByCatId[String(category.getInt("catId"))] = category;
  }

  const dishIds = [];
  for (const assignment of assignments) {
    const dishId = assignment.getString("dish");
    if (dishId && dishIds.indexOf(dishId) === -1) dishIds.push(dishId);
  }
  const dishesById = {};
  if (dishIds.length) {
    for (const dish of e.app.findRecordsByIds("dishes", dishIds)) dishesById[dish.id] = dish;
  }

  const assignmentsBySlot = {};
  for (const assignment of assignments) {
    assignmentsBySlot[assignment.getString("date") + ":" + assignment.getString("meal")] = assignment;
  }

  function compactCategory(record) {
    return record ? { id: record.id, name: record.getString("name_en") } : null;
  }

  function dayJson(date) {
    const meals = {};
    for (const meal of lib.MEALS) {
      const assignment = assignmentsBySlot[date + ":" + meal] || null;
      const assignedCategory = assignment
        ? categoriesById[assignment.getString("category")] || null
        : null;
      let category = assignedCategory;
      if (!category && meal === "dinner") {
        const rotation = lib.dinnerRotation(date);
        if (rotation.kind === "category") {
          category = categoriesByCatId[String(rotation.catId)] || null;
        }
      }

      const dish = assignment ? dishesById[assignment.getString("dish")] || null : null;
      meals[meal] = {
        category: compactCategory(category),
        assignment: dish ? { dishId: dish.id, name: dish.getString("name") } : null,
      };
    }
    return { date, meals };
  }

  const weekDays = [];
  for (let i = 0; i < 7; i += 1) weekDays.push(dayJson(lib.addDays(bounds.start, i)));

  return e.json(200, {
    schemaVersion: 1,
    generatedAt,
    timezone,
    today: dayJson(todayDate),
    target: dayJson(targetDate),
    week: { start: bounds.start, end: bounds.end, days: weekDays },
  });
}

function normalizeStringList(value, field) {
  if (typeof value === "undefined") return null;
  if (!Array.isArray(value)) throw lib.badRequest(field + " must be an array");
  return value.map((item) => lib.nonEmptyString(item, field + " item", 2000));
}

function normalizeIngredients(value) {
  if (typeof value === "undefined") return null;
  if (!Array.isArray(value)) throw lib.badRequest("dish.recipe.ingredients must be an array");
  return value.map((item) => {
    if (typeof item === "string") {
      return lib.nonEmptyString(item, "dish.recipe.ingredients item", 2000);
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw lib.badRequest("each ingredient must be a string or an object");
    }
    const ingredient = { name: lib.nonEmptyString(item.name, "ingredient.name", 300) };
    if (typeof item.quantity !== "undefined") ingredient.quantity = String(item.quantity).trim();
    if (typeof item.unit !== "undefined") ingredient.unit = String(item.unit).trim();
    if (typeof item.notes !== "undefined") ingredient.notes = String(item.notes).trim();
    return ingredient;
  });
}

function resolveCategories(app, values) {
  if (!Array.isArray(values)) throw lib.badRequest("dish.categories must be an array");
  const available = app.findRecordsByFilter("categories", "", "catId", 0, 0);
  const ids = [];
  const unresolved = [];
  for (const value of values) {
    const needle = String(value).trim().toLowerCase();
    let match = null;
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
        match = category;
        break;
      }
    }
    if (match) {
      if (ids.indexOf(match.id) === -1) ids.push(match.id);
    } else if (needle) {
      unresolved.push(String(value).trim());
    }
  }
  return { ids, unresolved };
}

function setMinutes(record, field, value) {
  if (typeof value === "undefined") return;
  if (!Number.isInteger(value) || value < 0 || value > 1440) {
    throw lib.badRequest(field + " must be an integer between 0 and 1440");
  }
  record.set(field, value);
}

function applyDishData(app, record, data, creating) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw lib.badRequest("dish must be an object");
  }
  if (creating || typeof data.name !== "undefined") {
    record.set("name", lib.nonEmptyString(data.name, "dish.name", 300));
  }
  if (typeof data.notes !== "undefined") record.set("notes", String(data.notes).trim());
  if (typeof data.cuisine !== "undefined") record.set("cuisine", String(data.cuisine).trim());
  if (typeof data.difficulty !== "undefined") {
    record.set("difficulty", lib.assertEnum(data.difficulty, ["easy", "medium", "hard"], "dish.difficulty"));
  }

  let tags = typeof data.tags === "undefined" ? null : normalizeStringList(data.tags, "dish.tags");
  if (typeof data.categories !== "undefined") {
    const resolved = resolveCategories(app, data.categories);
    record.set("categories", resolved.ids);
    if (resolved.ids.length) {
      const primary = app.findRecordById("categories", resolved.ids[0]);
      record.set("catId", primary.getInt("catId"));
    } else {
      record.set("catId", 0);
    }
    tags = (tags || []).concat(resolved.unresolved);
  }
  if (tags !== null) {
    const uniqueTags = [];
    for (const tag of tags) if (uniqueTags.indexOf(tag) === -1) uniqueTags.push(tag);
    record.set("tags", uniqueTags);
  }

  const recipe = data.recipe;
  if (typeof recipe !== "undefined") {
    if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
      throw lib.badRequest("dish.recipe must be an object");
    }
    const ingredients = normalizeIngredients(recipe.ingredients);
    const instructions = normalizeStringList(recipe.instructions, "dish.recipe.instructions");
    if (ingredients !== null) record.set("ingredients", ingredients);
    if (instructions !== null) record.set("instructions", instructions);
    setMinutes(record, "prep_minutes", recipe.prepMinutes);
    setMinutes(record, "cook_minutes", recipe.cookMinutes);
  }
}

function assignmentCategoryId(app, dish) {
  const categories = dish.getStringSlice("categories");
  if (categories.length) return categories[0];
  const catId = dish.getInt("catId");
  if (!catId) return "";
  const category = firstByFilter(app, "categories", "catId = {:catId}", { catId });
  return category ? category.id : "";
}

function assign(e) {
  const data = body(e);
  lib.parseDate(data.date);
  lib.assertMeal(data.meal);
  if (!data.dishId && !data.dish) {
    throw lib.badRequest("either dishId or dish is required");
  }
  if (data.dishId && typeof data.dishId !== "string") {
    throw lib.badRequest("dishId must be a PocketBase record id");
  }

  let response = null;
  e.app.runInTransaction((tx) => {
    const existing = firstByFilter(
      tx,
      "meal_assignments",
      "date = {:date} && meal = {:meal}",
      { date: data.date, meal: data.meal },
    );

    if (existing && !data.replaceExisting) {
      if (data.dishId && existing.getString("dish") === data.dishId) {
        const sameDish = tx.findRecordById("dishes", data.dishId);
        if (data.dish) {
          applyDishData(tx, sameDish, data.dish, false);
          tx.save(sameDish);
        }
        response = { created: false, unchanged: true, assignment: assignmentJson(tx, existing) };
        return;
      }
      throw new ApiError(409, "A different dish is already assigned to this date and meal.");
    }

    let dish;
    let dishCreated = false;
    if (data.dishId) {
      dish = optionalRecordById(tx, "dishes", data.dishId);
      if (!dish) throw new NotFoundError("Dish not found.");
      if (data.dish) applyDishData(tx, dish, data.dish, false);
    } else {
      dish = new Record(tx.findCollectionByNameOrId("dishes"));
      applyDishData(tx, dish, data.dish, true);
      dishCreated = true;
    }
    tx.save(dish);

    const assignment = existing || new Record(tx.findCollectionByNameOrId("meal_assignments"));
    assignment.set("date", data.date);
    assignment.set("meal", data.meal);
    assignment.set("dish", dish.id);
    assignment.set("category", assignmentCategoryId(tx, dish));
    if (typeof data.notes !== "undefined") assignment.set("notes", String(data.notes).trim());
    tx.save(assignment);

    response = {
      created: !existing,
      replaced: Boolean(existing),
      dishCreated,
      assignment: assignmentJson(tx, assignment),
    };
  });
  return e.json(response.created ? 201 : 200, response);
}

function ensureOccurrence(app, date, meal, dishId, updates) {
  let occurrence = firstByFilter(
    app,
    "cooked_occurrences",
    "date = {:date} && meal = {:meal}",
    { date, meal },
  );
  if (occurrence && occurrence.getString("dish") !== dishId) {
    throw new ApiError(409, "This meal already has a different cooked dish.");
  }
  const assignment = firstByFilter(
    app,
    "meal_assignments",
    "date = {:date} && meal = {:meal}",
    { date, meal },
  );
  // The actually cooked recipe may legitimately differ from the planned one.
  if (!optionalRecordById(app, "dishes", dishId)) throw new NotFoundError("Dish not found.");
  if (!occurrence) {
    occurrence = new Record(app.findCollectionByNameOrId("cooked_occurrences"));
    occurrence.set("date", date);
    occurrence.set("meal", meal);
    occurrence.set("dish", dishId);
    if (assignment) occurrence.set("assignment", assignment.id);
  }
  updates = updates || {};
  if (typeof updates.modifications !== "undefined") {
    occurrence.set("modifications", String(updates.modifications).trim());
  }
  if (typeof updates.notes !== "undefined") occurrence.set("notes", String(updates.notes).trim());
  app.save(occurrence);
  return occurrence;
}

function feedback(e) {
  const data = body(e);
  lib.parseDate(data.date);
  lib.assertMeal(data.meal);
  const dishId = lib.nonEmptyString(data.dishId, "dishId", 15);
  const memberId = lib.nonEmptyString(data.memberId, "memberId", 15);
  lib.assertEnum(data.rating, lib.RATINGS, "rating");
  lib.assertEnum(data.makeAgain, lib.MAKE_AGAIN, "makeAgain");

  let response;
  e.app.runInTransaction((tx) => {
    const member = optionalRecordById(tx, "household_members", memberId);
    if (!member || !member.getBool("active")) throw new NotFoundError("Household member not found.");
    const occurrence = ensureOccurrence(tx, data.date, data.meal, dishId, {
      modifications: data.modifications,
      notes: data.notes,
    });
    let record = firstByFilter(
      tx,
      "meal_feedback",
      "occurrence = {:occurrence} && member = {:member}",
      { occurrence: occurrence.id, member: memberId },
    );
    const created = !record;
    if (!record) record = new Record(tx.findCollectionByNameOrId("meal_feedback"));
    record.set("occurrence", occurrence.id);
    record.set("dish", dishId);
    record.set("member", memberId);
    record.set("rating", data.rating);
    record.set("make_again", data.makeAgain);
    if (typeof data.changes !== "undefined") record.set("changes", String(data.changes).trim());
    tx.save(record);
    response = { created, feedback: feedbackJson(tx, record), occurrence: occurrenceJson(tx, occurrence) };
  });
  return e.json(response.created ? 201 : 200, response);
}

function photo(e) {
  const data = body(e);
  const type = data.type;
  if (type !== "reference" && type !== "cooked") {
    throw lib.badRequest("type must be reference or cooked");
  }
  const files = e.findUploadedFiles("file");
  if (!files.length) throw lib.badRequest("at least one image file is required");

  if (type === "reference") {
    if (files.length !== 1) throw lib.badRequest("reference uploads accept exactly one file");
    const dishId = lib.nonEmptyString(data.dishId, "dishId", 15);
    const dish = optionalRecordById(e.app, "dishes", dishId);
    if (!dish) throw new NotFoundError("Dish not found.");
    let reference = firstByFilter(
      e.app,
      "dish_reference_photos",
      "dish = {:dish}",
      { dish: dishId },
    );
    if (!reference) reference = new Record(e.app.findCollectionByNameOrId("dish_reference_photos"));
    reference.set("dish", dishId);
    reference.set("photo", files[0]);
    e.app.save(reference);
    return e.json(200, { type, dish: dishJson(e.app, dish) });
  }

  lib.parseDate(data.date);
  lib.assertMeal(data.meal);
  const dishId = lib.nonEmptyString(data.dishId, "dishId", 15);
  let result;
  e.app.runInTransaction((tx) => {
    const occurrence = ensureOccurrence(tx, data.date, data.meal, dishId, {
      modifications: data.modifications,
      notes: data.notes,
    });
    occurrence.set("photos+", files);
    tx.save(occurrence);
    result = occurrenceJson(tx, occurrence);
  });
  return e.json(200, { type, occurrence: result });
}

function photoDownload(e) {
  e.response.header().set("Cache-Control", "private, no-store");
  const kind = e.request.pathValue("kind");
  const recordId = e.request.pathValue("recordId");
  const filename = e.request.pathValue("filename");
  let record;
  let allowed = false;
  if (kind === "reference") {
    record = optionalRecordById(e.app, "dish_reference_photos", recordId);
    allowed = record && record.getString("photo") === filename;
  } else if (kind === "cooked") {
    record = optionalRecordById(e.app, "cooked_occurrences", recordId);
    allowed = record && record.getStringSlice("photos").indexOf(filename) !== -1;
  }
  if (!record || !allowed) throw new NotFoundError("Photo not found.");

  const extension = filename.toLowerCase().split(".").pop();
  const contentTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  };
  const fsys = e.app.newFilesystem();
  let reader;
  try {
    reader = fsys.getReader(record.baseFilesPath() + "/" + filename);
    return e.stream(200, contentTypes[extension] || "application/octet-stream", reader);
  } finally {
    if (reader) reader.close();
    fsys.close();
  }
}

function suggestion(e) {
  const data = body(e);
  lib.parseDate(data.date);
  lib.assertMeal(data.meal);
  lib.assertEnum(data.outcome, lib.OUTCOMES, "outcome");
  if (!data.dishId && !data.suggestedName) {
    throw lib.badRequest("dishId or suggestedName is required");
  }
  if (data.outcome === "rejected" && typeof data.rejectionReason !== "undefined" && !String(data.rejectionReason).trim()) {
    throw lib.badRequest("rejectionReason cannot be blank when supplied");
  }
  if (data.dishId && !optionalRecordById(e.app, "dishes", data.dishId)) {
    throw new NotFoundError("Dish not found.");
  }
  if (data.memberId && !optionalRecordById(e.app, "household_members", data.memberId)) {
    throw new NotFoundError("Household member not found.");
  }
  const record = new Record(e.app.findCollectionByNameOrId("meal_suggestions"));
  record.set("date", data.date);
  record.set("meal", data.meal);
  if (data.dishId) record.set("dish", data.dishId);
  if (data.suggestedName) record.set("suggested_name", String(data.suggestedName).trim());
  record.set("outcome", data.outcome);
  if (data.rejectionReason) record.set("rejection_reason", String(data.rejectionReason).trim());
  if (data.memberId) record.set("member", data.memberId);
  e.app.save(record);
  return e.json(201, { suggestion: suggestionJson(e.app, record) });
}

module.exports = { assign, context, feedback, photo, photoDownload, suggestion };
