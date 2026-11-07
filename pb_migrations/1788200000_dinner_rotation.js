/// <reference path="../pb_data/types.d.ts" />

// The two-week dinner rotation lives in PocketBase so the planning agent can
// change it without a deploy. One row per (week 1|2, weekday 0-6 Monday-first):
// either a `category` relation or `kind = eat_out`. Seeded with the table that
// used to be hardcoded (docs/meal-categories.md). Rules mirror `categories`:
// public read, no public writes.
const SEED = {
  1: [12, 10, 7, 6, 2, null, 3],
  2: [5, 11, 8, 9, 4, null, 1],
};

migrate((app) => {
  const categories = app.findCollectionByNameOrId("categories");
  const rotation = new Collection({
    type: "base",
    name: "dinner_rotation",
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    indexes: ["CREATE UNIQUE INDEX idx_dinner_rotation_slot ON dinner_rotation (week, weekday)"],
  });
  // week and weekday are not `required`: PocketBase treats a required number
  // of 0 (Monday) as blank. The unique index and min/max still bound them.
  rotation.fields.add(new NumberField({ name: "week", min: 1, max: 2, onlyInt: true }));
  rotation.fields.add(new NumberField({ name: "weekday", min: 0, max: 6, onlyInt: true }));
  rotation.fields.add(new RelationField({
    name: "category",
    collectionId: categories.id,
    maxSelect: 1,
    cascadeDelete: false,
  }));
  rotation.fields.add(new SelectField({ name: "kind", maxSelect: 1, values: ["eat_out"] }));
  app.save(rotation);

  for (const week of [1, 2]) {
    SEED[week].forEach((catId, weekday) => {
      const record = new Record(rotation);
      record.set("week", week);
      record.set("weekday", weekday);
      if (catId === null) {
        record.set("kind", "eat_out");
      } else {
        record.set("category", app.findFirstRecordByData("categories", "catId", catId).id);
      }
      app.save(record);
    });
  }
}, (app) => {
  app.delete(app.findCollectionByNameOrId("dinner_rotation"));
});
