/// <reference path="../pb_data/types.d.ts" />

// Keep untrusted link-extraction state private until a household member
// explicitly confirms it. Confirmed imports are linked to a normal dish so
// the existing planner and feedback data remain the source of truth.
migrate((app) => {
  const dishes = app.findCollectionByNameOrId("dishes");
  const telegramUsers = app.findCollectionByNameOrId("telegram_users");

  const imports = new Collection({
    type: "base",
    name: "recipe_imports",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });
  imports.fields.add(
      new URLField({
        name: "source_url",
        required: true,
      })
  );
  imports.fields.add(
      new URLField({
        name: "canonical_url",
        required: true,
      })
  );
  imports.fields.add(
      new SelectField({
        name: "platform",
        required: true,
        maxSelect: 1,
        values: ["web", "youtube", "instagram", "other"],
      })
  );
  imports.fields.add(
      new SelectField({
        name: "status",
        required: true,
        maxSelect: 1,
        values: [
          "pending",
          "processing",
          "needs_input",
          "ready",
          "saved",
          "failed",
          "cancelled",
        ],
      })
  );
  imports.fields.add(
      new RelationField({
        name: "requested_by",
        collectionId: telegramUsers.id,
        required: true,
        maxSelect: 1,
        cascadeDelete: false,
      })
  );
  imports.fields.add(
      new TextField({
        name: "chat_id",
        required: true,
        max: 40,
      })
  );
  imports.fields.add(
      new TextField({
        name: "response_message_id",
        max: 40,
      })
  );
  imports.fields.add(
      new TextField({
        name: "source_title",
        max: 500,
      })
  );
  imports.fields.add(
      new TextField({
        name: "source_description",
        max: 20000,
      })
  );
  imports.fields.add(
      new JSONField({
        name: "source_metadata",
        maxSize: 200000,
      })
  );
  imports.fields.add(
      new JSONField({
        name: "extracted_recipe",
        maxSize: 500000,
      })
  );
  imports.fields.add(
      new NumberField({
        name: "confidence",
        min: 0,
        max: 1,
      })
  );
  imports.fields.add(
      new JSONField({
        name: "missing_fields",
        maxSize: 50000,
      })
  );
  imports.fields.add(
      new TextField({
        name: "error",
        max: 5000,
      })
  );
  imports.fields.add(
      new TextField({
        name: "model",
        max: 200,
      })
  );
  imports.fields.add(
      new RelationField({
        name: "dish",
        collectionId: dishes.id,
        maxSelect: 1,
        cascadeDelete: false,
      })
  );
  imports.fields.add(
      new AutodateField({
        name: "created",
        onCreate: true,
        onUpdate: false,
      })
  );
  imports.fields.add(
      new AutodateField({
        name: "updated",
        onCreate: true,
        onUpdate: true,
      })
  );
  imports.indexes = [
    "CREATE INDEX idx_recipe_imports_canonical_url ON recipe_imports (canonical_url)",
    "CREATE INDEX idx_recipe_imports_status_created ON recipe_imports (status, created)",
  ];
  app.save(imports);

  dishes.fields.add(new SelectField({
    name: "lifecycle",
    required: true,
    maxSelect: 1,
    values: ["regular", "want_to_try", "archived"],
  }));
  dishes.fields.add(new URLField({
    name: "source_url",
  }));
  dishes.fields.add(new SelectField({
    name: "source_platform",
    maxSelect: 1,
    values: ["web", "youtube", "instagram", "other"],
  }));
  dishes.fields.add(new RelationField({
    name: "source_import",
    hidden: true,
    collectionId: imports.id,
    maxSelect: 1,
    cascadeDelete: false,
    hidden: true,
  }));
  app.save(dishes);

  const existingDishes = app.findAllRecords("dishes");
  for (const dish of existingDishes) {
    dish.set("lifecycle", "regular");
    app.save(dish);
  }
}, (app) => {
  const dishes = app.findCollectionByNameOrId("dishes");
  dishes.fields.removeByName("source_import");
  dishes.fields.removeByName("source_platform");
  dishes.fields.removeByName("source_url");
  dishes.fields.removeByName("lifecycle");
  app.save(dishes);

  const imports = app.findCollectionByNameOrId("recipe_imports");
  app.delete(imports);
});
