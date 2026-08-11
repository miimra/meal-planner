// Extend the existing meal-assistant collections with the stable source
// identities and metadata required to mirror GitHub meal-data documents.
migrate((app) => {
  const dishes = app.findCollectionByNameOrId("dishes");
  dishes.fields.add(
    new TextField({ name: "github_recipe_id", max: 200 }),
    new TextField({ name: "description", max: 10000 }),
    new NumberField({ name: "servings", min: 0 }),
    new JSONField({ name: "source_categories", maxSize: 50000 }),
    new JSONField({ name: "source_steps", maxSize: 200000 }),
    new JSONField({ name: "reference_photo_metadata", maxSize: 50000 }),
    new DateField({ name: "source_created_at" }),
    new DateField({ name: "source_updated_at" }),
  );
  dishes.indexes = dishes.indexes.concat([
    "CREATE UNIQUE INDEX idx_dishes_github_recipe_id ON dishes (github_recipe_id) WHERE github_recipe_id != ''",
  ]);
  app.save(dishes);

  const members = app.findCollectionByNameOrId("household_members");
  members.fields.add(new TextField({ name: "external_id", max: 120 }));
  members.indexes = members.indexes.concat([
    "CREATE UNIQUE INDEX idx_household_members_external_id ON household_members (external_id) WHERE external_id != ''",
  ]);
  app.save(members);

  const assignments = app.findCollectionByNameOrId("meal_assignments");
  assignments.fields.getByName("dish").required = false;
  assignments.fields.add(
    new SelectField({
      name: "status",
      values: ["unplanned", "planned", "cooked", "skipped", "eating_out"],
      maxSelect: 1,
    }),
    new TextField({ name: "source_category", max: 200 }),
    new TextField({ name: "planned_recipe_id", max: 200 }),
    new BoolField({ name: "github_managed" }),
  );
  app.save(assignments);

  const occurrences = app.findCollectionByNameOrId("cooked_occurrences");
  occurrences.fields.getByName("dish").required = false;
  occurrences.fields.add(
    new TextField({ name: "source_recipe_id", max: 200 }),
    new DateField({ name: "cooked_at" }),
    new JSONField({ name: "source_photos", maxSize: 200000 }),
    new BoolField({ name: "github_managed" }),
    new BoolField({ name: "source_present" }),
  );
  app.save(occurrences);

  const feedback = app.findCollectionByNameOrId("meal_feedback");
  feedback.fields.getByName("dish").required = false;
  feedback.fields.add(
    new TextField({ name: "external_id", max: 300 }),
    new DateField({ name: "source_created_at" }),
    new BoolField({ name: "github_managed" }),
  );
  feedback.indexes = [
    "CREATE UNIQUE INDEX idx_meal_feedback_external_id ON meal_feedback (external_id) WHERE external_id != ''",
    "CREATE INDEX idx_meal_feedback_occurrence_member ON meal_feedback (occurrence, member)",
    "CREATE INDEX idx_meal_feedback_dish ON meal_feedback (dish)",
  ];
  app.save(feedback);

  const suggestions = app.findCollectionByNameOrId("meal_suggestions");
  suggestions.fields.getByName("outcome").values = ["pending", "accepted", "rejected"];
  suggestions.fields.add(
    new TextField({ name: "external_id", max: 300 }),
    new DateField({ name: "suggested_at" }),
    new DateField({ name: "decided_at" }),
    new BoolField({ name: "github_managed" }),
  );
  suggestions.indexes = suggestions.indexes.concat([
    "CREATE UNIQUE INDEX idx_meal_suggestions_external_id ON meal_suggestions (external_id) WHERE external_id != ''",
  ]);
  app.save(suggestions);

  const householdSettings = new Collection({
    type: "base",
    name: "household_settings",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "source_key", required: true, max: 120 },
      { type: "json", name: "preferences", required: true, maxSize: 50000 },
      { type: "text", name: "source_commit", max: 64 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_household_settings_source_key ON household_settings (source_key)",
    ],
  });
  app.save(householdSettings);

  const syncCommits = new Collection({
    type: "base",
    name: "github_sync_commits",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "repository", required: true, max: 300 },
      {
        type: "text",
        name: "commit_sha",
        required: true,
        min: 40,
        max: 64,
        pattern: "^[a-fA-F0-9]+$",
      },
      { type: "json", name: "files", maxSize: 500000 },
      { type: "json", name: "summary", maxSize: 100000 },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_github_sync_commits_repository_sha ON github_sync_commits (repository, commit_sha)",
      "CREATE INDEX idx_github_sync_commits_created ON github_sync_commits (created)",
    ],
  });
  app.save(syncCommits);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("github_sync_commits"));
  app.delete(app.findCollectionByNameOrId("household_settings"));

  const suggestions = app.findCollectionByNameOrId("meal_suggestions");
  suggestions.fields.getByName("outcome").values = ["accepted", "rejected"];
  for (const name of ["external_id", "suggested_at", "decided_at", "github_managed"]) {
    suggestions.fields.removeByName(name);
  }
  suggestions.indexes = [
    "CREATE INDEX idx_meal_suggestions_date_meal ON meal_suggestions (date, meal)",
  ];
  app.save(suggestions);

  const feedback = app.findCollectionByNameOrId("meal_feedback");
  for (const name of ["external_id", "source_created_at", "github_managed"]) {
    feedback.fields.removeByName(name);
  }
  feedback.fields.getByName("dish").required = true;
  feedback.indexes = [
    "CREATE UNIQUE INDEX idx_meal_feedback_occurrence_member ON meal_feedback (occurrence, member)",
    "CREATE INDEX idx_meal_feedback_dish ON meal_feedback (dish)",
  ];
  app.save(feedback);

  const occurrences = app.findCollectionByNameOrId("cooked_occurrences");
  for (const name of ["source_recipe_id", "cooked_at", "source_photos", "github_managed", "source_present"]) {
    occurrences.fields.removeByName(name);
  }
  occurrences.fields.getByName("dish").required = true;
  app.save(occurrences);

  const assignments = app.findCollectionByNameOrId("meal_assignments");
  for (const name of ["status", "source_category", "planned_recipe_id", "github_managed"]) {
    assignments.fields.removeByName(name);
  }
  assignments.fields.getByName("dish").required = true;
  app.save(assignments);

  const members = app.findCollectionByNameOrId("household_members");
  members.fields.removeByName("external_id");
  members.indexes = [
    "CREATE UNIQUE INDEX idx_household_members_name ON household_members (name)",
  ];
  app.save(members);

  const dishes = app.findCollectionByNameOrId("dishes");
  for (const name of [
    "github_recipe_id",
    "description",
    "servings",
    "source_categories",
    "source_steps",
    "reference_photo_metadata",
    "source_created_at",
    "source_updated_at",
  ]) {
    dishes.fields.removeByName(name);
  }
  dishes.indexes = ["CREATE INDEX idx_dishes_catId ON dishes (catId)"];
  app.save(dishes);
});
