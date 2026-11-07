/// <reference path="../pb_data/types.d.ts" />

// Dinners planned by an MCP agent record where they came from.
migrate((app) => {
  const assignments = app.findCollectionByNameOrId("meal_assignments");
  const source = assignments.fields.getByName("selection_source");
  if (source.values.indexOf("mcp") === -1) source.values = source.values.concat(["mcp"]);
  app.save(assignments);
}, (app) => {
  const records = app.findRecordsByFilter("meal_assignments", "selection_source = 'mcp'", "", 0, 0);
  for (const record of records) {
    record.set("selection_source", "");
    app.save(record);
  }
  const assignments = app.findCollectionByNameOrId("meal_assignments");
  const source = assignments.fields.getByName("selection_source");
  source.values = source.values.filter((value) => value !== "mcp");
  app.save(assignments);
});
