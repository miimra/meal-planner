// Persist the minimum data needed by the purpose-built meal assistant API.
// All new collections deliberately have locked generic CRUD rules. They are
// accessed by trusted server-side hooks and remain unavailable through the
// regular PocketBase records API.
migrate((app) => {
  const categories = app.findCollectionByNameOrId("categories");
  const dishes = app.findCollectionByNameOrId("dishes");

  // Keep catId for the existing UI, but allow assistant-created dishes that
  // have not yet been placed in one of the legacy rotation categories.
  dishes.fields.getByName("catId").required = false;
  dishes.fields.add(
    new RelationField({
      name: "categories",
      collectionId: categories.id,
      maxSelect: 12,
    }),
    new JSONField({ name: "ingredients", maxSize: 200000 }),
    new JSONField({ name: "instructions", maxSize: 200000 }),
    new NumberField({ name: "prep_minutes", onlyInt: true, min: 0, max: 1440 }),
    new NumberField({ name: "cook_minutes", onlyInt: true, min: 0, max: 1440 }),
    new SelectField({
      name: "difficulty",
      values: ["easy", "medium", "hard"],
      maxSelect: 1,
    }),
    new TextField({ name: "cuisine", max: 120 }),
    new JSONField({ name: "tags", maxSize: 50000 }),
    new AutodateField({ name: "created", onCreate: true }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
  );
  app.save(dishes);

  // Backfill the new relation without changing the legacy catId contract.
  const existingDishes = app.findAllRecords(dishes);
  for (const dish of existingDishes) {
    const matches = app.findRecordsByFilter(
      categories,
      "catId = {:catId}",
      "",
      1,
      0,
      { catId: dish.getInt("catId") },
    );
    if (matches.length > 0) {
      dish.set("categories", [matches[0].id]);
      app.save(dish);
    }
  }

  const members = new Collection({
    type: "base",
    name: "household_members",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "name", required: true, max: 120, presentable: true },
      { type: "bool", name: "active" },
      { type: "text", name: "preference_notes", max: 2000 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_household_members_name ON household_members (name)"],
  });
  app.save(members);

  for (const name of ["Amir", "Maryam"]) {
    const member = new Record(members);
    member.set("name", name);
    member.set("active", true);
    app.save(member);
  }

  // Reference images live outside the legacy public-readable dishes
  // collection so the original files can actually remain private.
  const referencePhotos = new Collection({
    type: "base",
    name: "dish_reference_photos",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      {
        type: "relation",
        name: "dish",
        collectionId: dishes.id,
        maxSelect: 1,
        required: true,
      },
      {
        type: "file",
        name: "photo",
        maxSelect: 1,
        maxSize: 5 * 1024 * 1024,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
        protected: true,
        required: true,
      },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_dish_reference_photos_dish ON dish_reference_photos (dish)"],
  });
  app.save(referencePhotos);

  const assignments = new Collection({
    type: "base",
    name: "meal_assignments",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      {
        type: "text",
        name: "date",
        required: true,
        min: 10,
        max: 10,
        pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
      },
      {
        type: "select",
        name: "meal",
        required: true,
        values: ["breakfast", "lunch", "dinner"],
        maxSelect: 1,
      },
      {
        type: "relation",
        name: "category",
        collectionId: categories.id,
        maxSelect: 1,
      },
      {
        type: "relation",
        name: "dish",
        collectionId: dishes.id,
        maxSelect: 1,
        required: true,
      },
      { type: "text", name: "notes", max: 2000 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_meal_assignments_date_meal ON meal_assignments (date, meal)",
      "CREATE INDEX idx_meal_assignments_dish ON meal_assignments (dish)",
    ],
  });
  app.save(assignments);

  const occurrences = new Collection({
    type: "base",
    name: "cooked_occurrences",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      {
        type: "text",
        name: "date",
        required: true,
        min: 10,
        max: 10,
        pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
      },
      {
        type: "select",
        name: "meal",
        required: true,
        values: ["breakfast", "lunch", "dinner"],
        maxSelect: 1,
      },
      {
        type: "relation",
        name: "assignment",
        collectionId: assignments.id,
        maxSelect: 1,
      },
      {
        type: "relation",
        name: "dish",
        collectionId: dishes.id,
        maxSelect: 1,
        required: true,
      },
      {
        type: "file",
        name: "photos",
        maxSelect: 10,
        maxSize: 10 * 1024 * 1024,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
        protected: true,
      },
      { type: "text", name: "modifications", max: 4000 },
      { type: "text", name: "notes", max: 4000 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_cooked_occurrences_date_meal ON cooked_occurrences (date, meal)",
      "CREATE INDEX idx_cooked_occurrences_dish ON cooked_occurrences (dish)",
    ],
  });
  app.save(occurrences);

  const feedback = new Collection({
    type: "base",
    name: "meal_feedback",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      {
        type: "relation",
        name: "occurrence",
        collectionId: occurrences.id,
        maxSelect: 1,
        required: true,
      },
      {
        type: "relation",
        name: "dish",
        collectionId: dishes.id,
        maxSelect: 1,
        required: true,
      },
      {
        type: "relation",
        name: "member",
        collectionId: members.id,
        maxSelect: 1,
        required: true,
      },
      {
        type: "select",
        name: "rating",
        required: true,
        values: ["liked", "okay", "disliked"],
        maxSelect: 1,
      },
      {
        type: "select",
        name: "make_again",
        required: true,
        values: ["yes", "maybe", "no"],
        maxSelect: 1,
      },
      { type: "text", name: "changes", max: 4000 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_meal_feedback_occurrence_member ON meal_feedback (occurrence, member)",
      "CREATE INDEX idx_meal_feedback_dish ON meal_feedback (dish)",
    ],
  });
  app.save(feedback);

  const suggestions = new Collection({
    type: "base",
    name: "meal_suggestions",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      {
        type: "text",
        name: "date",
        required: true,
        min: 10,
        max: 10,
        pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
      },
      {
        type: "select",
        name: "meal",
        required: true,
        values: ["breakfast", "lunch", "dinner"],
        maxSelect: 1,
      },
      { type: "relation", name: "dish", collectionId: dishes.id, maxSelect: 1 },
      { type: "text", name: "suggested_name", max: 300 },
      {
        type: "select",
        name: "outcome",
        required: true,
        values: ["accepted", "rejected"],
        maxSelect: 1,
      },
      { type: "text", name: "rejection_reason", max: 2000 },
      { type: "relation", name: "member", collectionId: members.id, maxSelect: 1 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_meal_suggestions_date_meal ON meal_suggestions (date, meal)"],
  });
  app.save(suggestions);
}, (app) => {
  for (const name of [
    "meal_suggestions",
    "meal_feedback",
    "cooked_occurrences",
    "meal_assignments",
    "dish_reference_photos",
    "household_members",
  ]) {
    app.delete(app.findCollectionByNameOrId(name));
  }

  const dishes = app.findCollectionByNameOrId("dishes");
  for (const name of [
    "categories",
    "ingredients",
    "instructions",
    "prep_minutes",
    "cook_minutes",
    "difficulty",
    "cuisine",
    "tags",
    "created",
    "updated",
  ]) {
    dishes.fields.removeByName(name);
  }
  dishes.fields.getByName("catId").required = true;
  app.save(dishes);
});
