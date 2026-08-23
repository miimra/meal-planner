/// <reference path="../pb_data/types.d.ts" />

// Store the bot-owned Telegram messages so each chat can be updated in place,
// and cache suggestion artwork without making it publicly downloadable.
migrate((app) => {
  const chats = app.findCollectionByNameOrId("telegram_chats");
  chats.fields.add(new TextField({
    name: "control_panel_message_id",
    max: 40,
  }));
  chats.fields.add(new TextField({
    name: "suggestion_card_message_id",
    max: 40,
  }));
  app.save(chats);

  const suggestions = app.findCollectionByNameOrId("meal_suggestions");
  suggestions.fields.add(new FileField({
    name: "generated_image",
    maxSelect: 1,
    maxSize: 10485760,
    mimeTypes: ["image/jpeg", "image/webp"],
    protected: true,
  }));
  suggestions.fields.add(new TextField({
    name: "generated_image_model",
    max: 200,
  }));
  suggestions.fields.add(new TextField({
    name: "telegram_image_file_id",
    max: 300,
  }));
  app.save(suggestions);
}, (app) => {
  const chats = app.findCollectionByNameOrId("telegram_chats");
  chats.fields.removeByName("control_panel_message_id");
  chats.fields.removeByName("suggestion_card_message_id");
  app.save(chats);

  const suggestions = app.findCollectionByNameOrId("meal_suggestions");
  suggestions.fields.removeByName("generated_image");
  suggestions.fields.removeByName("generated_image_model");
  suggestions.fields.removeByName("telegram_image_file_id");
  app.save(suggestions);
});
