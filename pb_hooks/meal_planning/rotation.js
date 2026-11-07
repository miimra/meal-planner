"use strict";

// Loads the editable two-week dinner rotation from the `dinner_rotation`
// collection into the plain table shape calendar.dinnerRotation understands:
// { 1: [catId|null x7], 2: [...] } Monday-first, null = eat out.
// Returns null when the collection has no rows, so callers fall back to the
// hardcoded table in calendar.js.

function loadTable(app) {
  const rows = app.findRecordsByFilter("dinner_rotation", "", "", 0, 0);
  if (!rows.length) return null;
  const table = { 1: [], 2: [] };
  for (const row of rows) {
    const week = row.getInt("week");
    const weekday = row.getInt("weekday");
    if ((week !== 1 && week !== 2) || weekday < 0 || weekday > 6) continue;
    if (row.getString("kind") === "eat_out" || !row.getString("category")) {
      table[week][weekday] = null;
    } else {
      table[week][weekday] = app.findRecordById("categories", row.getString("category")).getInt("catId");
    }
  }
  return table;
}

// Points one (week, weekday) slot at a category record, or at eating out when
// `category` is null. Creates the row if the collection lacks it.
function setDay(app, week, weekday, category) {
  const rows = app.findRecordsByFilter("dinner_rotation", "week = {:week} && weekday = {:weekday}", "", 1, 0, { week, weekday });
  const row = rows.length ? rows[0] : new Record(app.findCollectionByNameOrId("dinner_rotation"));
  row.set("week", week);
  row.set("weekday", weekday);
  row.set("category", category ? category.id : "");
  row.set("kind", category ? "" : "eat_out");
  app.save(row);
}

module.exports = { loadTable, setDay };
