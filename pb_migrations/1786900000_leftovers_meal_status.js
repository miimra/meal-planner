/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const assignments = app.findCollectionByNameOrId("meal_assignments");
  const status = assignments.fields.getByName("status");
  if (status.values.indexOf("leftovers") === -1) status.values = status.values.concat(["leftovers"]);
  app.save(assignments);
}, (app) => {
  const records = app.findRecordsByFilter("meal_assignments", "status = 'leftovers'", "", 0, 0);
  for (const record of records) {
    record.set("status", "unplanned");
    app.save(record);
  }
  const assignments = app.findCollectionByNameOrId("meal_assignments");
  const status = assignments.fields.getByName("status");
  status.values = status.values.filter((value) => value !== "leftovers");
  app.save(assignments);
});
