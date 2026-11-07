"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const service = require(`${__hooks}/meal_planning/service.js`);
const rotationStore = require(`${__hooks}/meal_planning/rotation.js`);
const clock = require(`${__hooks}/mcp/clock.js`);
const { ToolError } = require(`${__hooks}/mcp/errors.js`);
const { requireDate } = require(`${__hooks}/mcp/args.js`);

const MAX_PLAN_DAYS = 62;
const MAX_ROTATION_WEEKS = 8;
const DEFAULT_ROTATION_WEEKS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(date) {
  return Date.parse(date + "T00:00:00Z") / DAY_MS;
}

function getWeek(app, args) {
  const date = args.date === undefined ? calendar.planningWeekStart(clock.localNow().date) : requireDate(args.date, "date");
  return service.weekValue(app, date);
}

function getPlan(app, args) {
  const from = requireDate(args.from, "from");
  const to = requireDate(args.to, "to");
  if (to < from) throw new ToolError("to must not be before from", "invalid_params");
  const count = dayNumber(to) - dayNumber(from) + 1;
  if (count > MAX_PLAN_DAYS) throw new ToolError(`the date range may span at most ${MAX_PLAN_DAYS} days`, "invalid_params");
  const days = [];
  for (let i = 0; i < count; i += 1) days.push(service.dayValue(app, calendar.addDays(from, i)));
  return { from: from, to: to, days: days };
}

function listCategories(app) {
  return { categories: app.findRecordsByFilter("categories", "", "catId", 0, 0).map(service.categoryValue) };
}

function getRotation(app, args) {
  const weeks = args.weeks === undefined ? DEFAULT_ROTATION_WEEKS : args.weeks;
  if (weeks < 1 || weeks > MAX_ROTATION_WEEKS) throw new ToolError(`weeks must be between 1 and ${MAX_ROTATION_WEEKS}`, "invalid_params");
  const anchor = args.from === undefined ? clock.localNow().date : requireDate(args.from, "from");
  const start = args.from === undefined ? calendar.planningWeekStart(anchor) : calendar.weekBounds(anchor).start;
  const categories = {};
  for (const record of app.findRecordsByFilter("categories", "", "catId", 0, 0)) {
    const value = service.categoryValue(record);
    categories[value.catId] = value;
  }
  const table = rotationStore.loadTable(app);
  const days = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const date = calendar.addDays(start, i);
    const rotation = calendar.dinnerRotation(date, table);
    days.push(rotation.kind === "eat_out"
      ? { date: date, rotationWeek: rotation.rotationWeek, kind: "eat_out", catId: null, category: null }
      : { date: date, rotationWeek: rotation.rotationWeek, kind: "category", catId: rotation.catId, category: categories[rotation.catId] || null });
  }
  return { start: start, weeks: weeks, days: days };
}

const SPECIAL_STATUSES = ["leftovers", "buy_food", "eating_out", "skipped"];
const MAX_INGREDIENTS = 50;
const MAX_TEXT = 200;

function logAction(tool, date, result) {
  console.log(`MCP action: ${tool} ${date} -> ${String(result).replace(/[\r\n]+/g, " ")}`);
}

function limited(text) {
  return String(text).replace(/[\r\n]+/g, " ").slice(0, MAX_TEXT);
}

// Dinners are planned from today onwards; the past is history.
function requireNotPast(date) {
  if (date < clock.localNow().date) throw new ToolError("date is in the past; only today and later dates can be changed", "past_date");
}

function writeDate(args) {
  const date = requireDate(args.date, "date");
  requireNotPast(date);
  return date;
}

function dinnerResult(app, date) {
  return service.dayValue(app, date);
}

function setDinner(app, args) {
  const date = writeDate(args);
  const hasId = args.dishId !== undefined;
  const hasName = args.dishName !== undefined;
  if (hasId === hasName) throw new ToolError("provide exactly one of dishId or dishName", "invalid_params");
  let ingredients = [];
  if (args.ingredients !== undefined) {
    if (args.ingredients.length > MAX_INGREDIENTS || args.ingredients.some(function (item) { return typeof item !== "string"; })) {
      throw new ToolError(`ingredients must be at most ${MAX_INGREDIENTS} strings`, "invalid_params");
    }
    ingredients = args.ingredients.map(function (item) { return item.trim().slice(0, MAX_TEXT); }).filter(Boolean);
  }
  let name = "";
  if (hasName) {
    name = service.normalizeDishName(args.dishName);
    if (!name) throw new ToolError("dishName must not be empty", "invalid_params");
  } else if (!args.dishId.trim()) {
    throw new ToolError("dishId must not be empty", "invalid_params");
  }
  // Expected failures are raised before the transaction: an exception thrown
  // inside runInTransaction crosses into Go and loses its type.
  if (hasId && !service.dishExists(app, args.dishId)) throw new ToolError("no dish with that dishId", "dish_not_found");
  let result;
  app.runInTransaction(function (tx) {
    if (hasId) {
      service.setExistingDish(tx, date, "dinner", args.dishId, ingredients, "mcp");
    } else {
      service.setManualDish(tx, date, "dinner", name, ingredients, "mcp");
    }
    result = dinnerResult(tx, date);
  });
  logAction("set_dinner", date, `planned ${limited(result.meals.dinner.dish.name)}`);
  return result;
}

function setDinnerStatus(app, args) {
  const date = writeDate(args);
  if (SPECIAL_STATUSES.indexOf(args.status) === -1) throw new ToolError(`status must be one of: ${SPECIAL_STATUSES.join(", ")}`, "invalid_params");
  let result;
  app.runInTransaction(function (tx) {
    service.setSpecialStatus(tx, date, "dinner", args.status, "mcp");
    result = dinnerResult(tx, date);
  });
  logAction("set_dinner_status", date, args.status);
  return result;
}

function clearDinner(app, args) {
  const date = writeDate(args);
  let result;
  let cleared = true;
  app.runInTransaction(function (tx) {
    cleared = service.clearAssignment(tx, date, "dinner");
    result = dinnerResult(tx, date);
  });
  if (!cleared) {
    logAction("clear_dinner", date, "has_history");
    throw new ToolError("this dinner has cooked history and cannot be cleared", "has_history");
  }
  logAction("clear_dinner", date, "cleared");
  return result;
}

function setDayCategory(app, args) {
  const date = writeDate(args);
  if (args.catId !== null && !Number.isInteger(args.catId)) throw new ToolError("catId must be an integer or null", "invalid_params");
  let category = null;
  if (args.catId !== null) {
    category = service.categoryByCatId(app, args.catId);
    if (!category) throw new ToolError("unknown catId; use list_categories", "unknown_category");
  }
  let result;
  app.runInTransaction(function (tx) {
    service.setCategoryOverride(tx, date, "dinner", category, "mcp");
    result = dinnerResult(tx, date);
  });
  logAction("set_day_category", date, args.catId === null ? "override removed" : `catId ${args.catId}`);
  return result;
}

// Changes the base rotation only: dates that already have an assignment keep
// the category stored on it, and past assignments are never rewritten.
function setRotationDay(app, args) {
  if (!Number.isInteger(args.week) || args.week < 1 || args.week > 2) throw new ToolError("week must be 1 or 2", "invalid_params");
  if (!Number.isInteger(args.weekday) || args.weekday < 0 || args.weekday > 6) throw new ToolError("weekday must be an integer from 0 (Monday) to 6 (Sunday)", "invalid_params");
  const eatOut = args.catId === "eat_out";
  let category = null;
  if (!eatOut) {
    if (!Number.isInteger(args.catId)) throw new ToolError("catId must be an integer or \"eat_out\"", "invalid_params");
    category = service.categoryByCatId(app, args.catId);
    if (!category) throw new ToolError("unknown catId; use list_categories", "unknown_category");
  }
  rotationStore.setDay(app, args.week, args.weekday, category);
  logAction("set_rotation_day", `week ${args.week} weekday ${args.weekday}`, eatOut ? "eat_out" : `catId ${args.catId}`);
  return getRotation(app, { from: undefined, weeks: DEFAULT_ROTATION_WEEKS });
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const DATE_PROP = { type: "string", description: "Dinner date, YYYY-MM-DD in APP_TIMEZONE. Today or later; earlier dates fail with past_date." };

module.exports = [{
  name: "get_week",
  title: "Get week plan",
  description: "Returns the dinner plan for the Monday-Sunday week containing `date` (YYYY-MM-DD in APP_TIMEZONE; default: the week being planned, which is the coming week on Sundays). Each of the 7 days has a dinner slot with status (planned, unplanned, eating_out, leftovers, buy_food, skipped), dish, category (a per-day override or the rotation category; Saturday is eating_out) and selectionSource. Use it to see what is already planned and what is open. Returns one week.",
  inputSchema: {
    type: "object",
    properties: { date: { type: "string", description: "Any date in the wanted week, YYYY-MM-DD. Defaults to the planning week." } },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  handler: getWeek,
}, {
  name: "get_plan",
  title: "Get plan range",
  description: "Returns one dinner slot per day from `from` to `to` inclusive (YYYY-MM-DD in APP_TIMEZONE, at most 62 days), in the same shape as get_week days: date, status, dish, category, selectionSource. Use it for ranges that cross week boundaries. Fails with a plain message for a bad date, `to` before `from`, or a longer range.",
  inputSchema: {
    type: "object",
    properties: {
      from: { type: "string", description: "First date, YYYY-MM-DD." },
      to: { type: "string", description: "Last date (inclusive), YYYY-MM-DD, not before from and at most 62 days after it." },
    },
    required: ["from", "to"],
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  handler: getPlan,
}, {
  name: "list_categories",
  title: "List meal categories",
  description: "Returns every meal category sorted by catId with all stored fields: id, catId, name, nameFa, emoji, style, effort, effortMinutes, weekendOnly, prepAhead and notes. Use it to learn what each catId in the plan or rotation means. Takes no arguments.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: READ_ONLY,
  handler: listCategories,
}, {
  name: "get_rotation",
  title: "Get dinner rotation",
  description: "Returns the two-week dinner category rotation resolved to concrete dates, starting on the Monday of the week containing `from` (default: the week being planned) and covering `weeks` weeks (default 2, max 8). Each day has rotationWeek (1 or 2) and either catId with its category, or kind eat_out with null catId (Saturday). The rotation is stored in PocketBase and changed with set_rotation_day. This is the base rotation only; use get_week or get_plan to see overrides.",
  inputSchema: {
    type: "object",
    properties: {
      from: { type: "string", description: "Any date in the first week, YYYY-MM-DD. Defaults to the planning week." },
      weeks: { type: "integer", description: "Number of weeks, 1 to 8 (default 2)." },
    },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  handler: getRotation,
}, {
  name: "set_dinner",
  title: "Plan a dinner",
  description: "Plans the dinner for `date` (today or later) with an existing dish (`dishId`, or `dishName` matching exactly) or, for an unknown `dishName`, creates the dish in the day's category. Provide exactly one of dishId or dishName. Works on Saturday too. Replaces any earlier plan or status for the day and rejects its pending suggestions. Optional `ingredients` replaces the dish's ingredient list. Never looks up ingredients itself. Returns the resulting day in the get_week shape. Errors: past_date, dish_not_found, invalid_params.",
  inputSchema: {
    type: "object",
    properties: {
      date: DATE_PROP,
      dishId: { type: "string", description: "Id of an existing dish (see list_dishes). Use this or dishName." },
      dishName: { type: "string", description: "Exact name of an existing dish, or the name of a new dish to create. Use this or dishId." },
      ingredients: { type: "array", description: "Optional ingredient strings (max 50) to store on the dish.", items: { type: "string" } },
    },
    required: ["date"],
    additionalProperties: false,
  },
  annotations: WRITE,
  handler: setDinner,
}, {
  name: "set_dinner_status",
  title: "Set dinner status",
  description: "Marks the dinner on `date` (today or later) as leftovers, buy_food, eating_out or skipped, replacing any planned dish. Returns the resulting day in the get_week shape. Errors: past_date, invalid_params.",
  inputSchema: {
    type: "object",
    properties: {
      date: DATE_PROP,
      status: { type: "string", enum: SPECIAL_STATUSES, description: "One of leftovers, buy_food, eating_out, skipped." },
    },
    required: ["date", "status"],
    additionalProperties: false,
  },
  annotations: WRITE,
  handler: setDinnerStatus,
}, {
  name: "clear_dinner",
  title: "Clear a dinner",
  description: "Deletes the dinner plan or status for `date` (today or later) so the slot is unplanned again, including any category override. Fails with has_history when the dinner has cooked occurrences. Returns the resulting day in the get_week shape. Errors: past_date, has_history.",
  inputSchema: {
    type: "object",
    properties: { date: DATE_PROP },
    required: ["date"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: clearDinner,
}, {
  name: "set_day_category",
  title: "Override day category",
  description: "Overrides the dinner category for `date` (today or later) with `catId` (see list_categories), or removes the override with null so the rotation category applies again. Any planned dish is kept. Returns the resulting day in the get_week shape. Errors: past_date, unknown_category.",
  inputSchema: {
    type: "object",
    properties: {
      date: DATE_PROP,
      catId: { type: ["integer", "null"], description: "Category catId to use for that day, or null to remove the override." },
    },
    required: ["date", "catId"],
    additionalProperties: false,
  },
  annotations: WRITE,
  handler: setDayCategory,
}, {
  name: "set_rotation_day",
  title: "Change a rotation day",
  description: "Changes the base two-week dinner rotation: sets the category for `weekday` (0 = Monday … 6 = Sunday) of rotation `week` (1 or 2) to `catId` (see list_categories) or to \"eat_out\". Applies to every future date of that week/weekday without an assignment; dates that already have an assignment keep their stored category. Returns the resulting get_rotation view. Errors: unknown_category, invalid_params.",
  inputSchema: {
    type: "object",
    properties: {
      week: { type: "integer", description: "Rotation week, 1 or 2 (see get_context / get_rotation)." },
      weekday: { type: "integer", description: "0 = Monday … 6 = Sunday." },
      catId: { type: ["integer", "string"], description: "Category catId, or the string \"eat_out\"." },
    },
    required: ["week", "weekday", "catId"],
    additionalProperties: false,
  },
  annotations: WRITE,
  handler: setRotationDay,
}];
