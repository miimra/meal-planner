"use strict";

const json = require(`${__hooks}/shared/json.js`);
const { ToolError } = require(`${__hooks}/mcp/errors.js`);
const { requireDate } = require(`${__hooks}/mcp/args.js`);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_HISTORY_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

function strings(record, field) {
  return json.arrayField(record, field).map(String);
}

function categoryIndex(app) {
  const index = {};
  for (const category of app.findRecordsByFilter("categories", "", "catId", 0, 0)) {
    index[category.id] = { catId: category.getInt("catId"), name: category.getString("name_en") };
  }
  return index;
}

function dishFields(dish, categories) {
  const related = dish.getStringSlice("categories")
    .map(function (id) { return categories[id]; })
    .filter(Boolean);
  return {
    id: dish.id,
    name: dish.getString("name"),
    catId: dish.getInt("catId") || null,
    relatedCategories: related,
    ingredients: strings(dish, "ingredients"),
    prepMinutes: dish.getInt("prep_minutes") || 0,
    cookMinutes: dish.getInt("cook_minutes") || 0,
    difficulty: dish.getString("difficulty") || null,
    cuisine: dish.getString("cuisine") || null,
    tags: strings(dish, "tags"),
    notes: dish.getString("notes") || null,
  };
}

function allDishes(app) {
  return app.findRecordsByFilter("dishes", "", "name", 0, 0);
}

function matchesQuery(fields, query) {
  const haystack = [fields.name, fields.cuisine, fields.notes].concat(fields.ingredients, fields.tags)
    .filter(Boolean).join("\n").toLowerCase();
  return haystack.indexOf(query) !== -1;
}

function listDishes(app, args) {
  const limit = args.limit === undefined ? DEFAULT_LIMIT : args.limit;
  if (limit < 1 || limit > MAX_LIMIT) throw new ToolError(`limit must be between 1 and ${MAX_LIMIT}`, "invalid_params");
  const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
  const categories = categoryIndex(app);
  const matches = [];
  for (const dish of allDishes(app)) {
    const fields = dishFields(dish, categories);
    if (args.categoryId !== undefined && fields.catId !== args.categoryId &&
        !fields.relatedCategories.some(function (c) { return c.catId === args.categoryId; })) continue;
    if (query && !matchesQuery(fields, query)) continue;
    matches.push(fields);
  }
  return { total: matches.length, dishes: matches.slice(0, limit) };
}

function getDish(app, args) {
  const hasId = args.id !== undefined, hasName = args.name !== undefined;
  if (hasId === hasName) throw new ToolError("provide exactly one of id or name", "invalid_params");
  const wanted = hasName ? String(args.name).trim().toLowerCase() : "";
  const dish = allDishes(app).find(function (d) {
    return hasId ? d.id === args.id : d.getString("name").trim().toLowerCase() === wanted;
  });
  if (!dish) throw new ToolError(hasId ? "No dish with that id" : "No dish with that name", "not_found");
  const fields = dishFields(dish, categoryIndex(app));
  fields.instructions = strings(dish, "instructions");
  return fields;
}

function dayNumber(date) {
  return Date.parse(date + "T00:00:00Z") / DAY_MS;
}

function getHistory(app, args) {
  const from = requireDate(args.from, "from");
  const to = requireDate(args.to, "to");
  if (to < from) throw new ToolError("to must not be before from", "invalid_params");
  if (dayNumber(to) - dayNumber(from) + 1 > MAX_HISTORY_DAYS) {
    throw new ToolError(`the date range may span at most ${MAX_HISTORY_DAYS} days`, "invalid_params");
  }
  const params = { from: from, to: to };
  const occurrences = app.findRecordsByFilter("cooked_occurrences", "date >= {:from} && date <= {:to}", "date,meal", 0, 0, params);
  const dishes = {};
  for (const dish of allDishes(app)) dishes[dish.id] = { id: dish.id, name: dish.getString("name") };
  const members = {};
  for (const member of app.findRecordsByFilter("household_members", "", "name", 0, 0)) members[member.id] = member.getString("name");
  return {
    from: from,
    to: to,
    occurrences: occurrences.map(function (occurrence) {
      const feedback = app.findRecordsByFilter("meal_feedback", "occurrence = {:id}", "created", 0, 0, { id: occurrence.id });
      return {
        date: occurrence.getString("date"),
        meal: occurrence.getString("meal"),
        dish: dishes[occurrence.getString("dish")] || null,
        notes: occurrence.getString("notes") || null,
        modifications: occurrence.getString("modifications") || null,
        feedback: feedback.map(function (item) {
          return {
            member: members[item.getString("member")] || null,
            rating: item.getString("rating") || null,
            make_again: item.getString("make_again") || null,
            changes: item.getString("changes") || null,
          };
        }),
      };
    }),
  };
}

function getHousehold(app) {
  return {
    members: app.findRecordsByFilter("household_members", "active = true", "name", 0, 0).map(function (member) {
      return { id: member.id, name: member.getString("name"), preference_notes: member.getString("preference_notes") || null };
    }),
  };
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const EMPTY_SCHEMA = { type: "object", properties: {}, additionalProperties: false };

module.exports = [{
  name: "list_dishes",
  title: "List dishes",
  description: "Lists dishes in the household's dish catalog, sorted by name, each with id, name, primary catId, relatedCategories, ingredients, prepMinutes, cookMinutes, difficulty, cuisine, tags and notes (no instructions; use get_dish for those). Use it to browse or search candidates for the plan. Returns total matches and at most `limit` dishes (default 50, max 200).",
  inputSchema: {
    type: "object",
    properties: {
      categoryId: { type: "integer", description: "Only dishes whose primary or related category has this catId." },
      query: { type: "string", description: "Case-insensitive text matched against name, cuisine, notes, ingredients and tags." },
      limit: { type: "integer", description: "Maximum number of dishes to return, 1 to 200 (default 50)." },
    },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  handler: listDishes,
}, {
  name: "get_dish",
  title: "Get dish",
  description: "Returns one dish with all list_dishes fields plus its instructions. Use it when you need the recipe. Give exactly one of id or name (name matches exactly, ignoring case). Fails with a plain message if no dish matches.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The dish id as returned by list_dishes." },
      name: { type: "string", description: "The exact dish name, case-insensitive." },
    },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  handler: getDish,
}, {
  name: "get_history",
  title: "Get cooked history",
  description: "Returns the meals actually cooked from `from` to `to` inclusive (dates YYYY-MM-DD in APP_TIMEZONE, at most 366 days), ordered by date, each with its dish, notes and every household member's feedback: rating, make_again and changes. Use it to learn what was liked and what to avoid repeating.",
  inputSchema: {
    type: "object",
    properties: {
      from: { type: "string", description: "First date of the range, YYYY-MM-DD." },
      to: { type: "string", description: "Last date of the range (inclusive), YYYY-MM-DD, not before from." },
    },
    required: ["from", "to"],
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  handler: getHistory,
}, {
  name: "get_household",
  title: "Get household",
  description: "Returns the active household members (id, name) with their preference_notes. Use it to respect tastes and restrictions when planning. Contains no Telegram identifiers.",
  inputSchema: EMPTY_SCHEMA,
  annotations: READ_ONLY,
  handler: getHousehold,
}];
