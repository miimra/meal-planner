"use strict";

const calendar = require(`${__hooks}/meal_planning/calendar.js`);
const clock = require(`${__hooks}/mcp/clock.js`);

function buildContext(now) {
  const planningWeekStart = calendar.planningWeekStart(now.date);
  return {
    today: now.date,
    timezone: now.timezone,
    time: now.time,
    planningWeekStart: planningWeekStart,
    rotationWeek: calendar.dinnerRotation(now.date).rotationWeek,
    planningWeekRotationWeek: calendar.dinnerRotation(planningWeekStart).rotationWeek,
  };
}

module.exports = [{
  name: "get_context",
  title: "Get planning context",
  description: "Today's local date, the timezone (APP_TIMEZONE), the current local time, the start (Monday) of the week being planned, the rotation week (1 or 2) of today, and the rotation week of the planning week.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: function () { return buildContext(clock.localNow()); },
}];
