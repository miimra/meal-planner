/// <reference path="../pb_data/types.d.ts" />

// The bot moved from a daily three-meal check-in to one weekly dinner plan on
// Sunday, followed by hourly nudges while dinners are still open.
migrate((app) => {
  const runs = app.findCollectionByNameOrId("telegram_delivery_runs");
  const kind = runs.fields.getByName("kind");
  for (const value of ["weekly", "nudge"]) {
    if (kind.values.indexOf(value) === -1) kind.values = kind.values.concat([value]);
  }
  app.save(runs);
}, (app) => {
  const stale = app.findRecordsByFilter("telegram_delivery_runs", "kind = 'weekly' || kind = 'nudge'", "", 0, 0);
  for (const record of stale) app.delete(record);
  const runs = app.findCollectionByNameOrId("telegram_delivery_runs");
  const kind = runs.fields.getByName("kind");
  kind.values = kind.values.filter((value) => value === "daily");
  app.save(runs);
});
