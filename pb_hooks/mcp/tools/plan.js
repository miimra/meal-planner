"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const service = require(`${__hooks}/meal_planning/service.js`);
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
  const days = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const date = calendar.addDays(start, i);
    const rotation = calendar.dinnerRotation(date);
    days.push(rotation.kind === "eat_out"
      ? { date: date, rotationWeek: rotation.rotationWeek, kind: "eat_out", catId: null, category: null }
      : { date: date, rotationWeek: rotation.rotationWeek, kind: "category", catId: rotation.catId, category: categories[rotation.catId] || null });
  }
  return { start: start, weeks: weeks, days: days };
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

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
  description: "Returns the two-week dinner category rotation resolved to concrete dates, starting on the Monday of the week containing `from` (default: the week being planned) and covering `weeks` weeks (default 2, max 8). Each day has rotationWeek (1 or 2) and either catId with its category, or kind eat_out with null catId (Saturday). This is the base rotation only; use get_week or get_plan to see overrides.",
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
}];
