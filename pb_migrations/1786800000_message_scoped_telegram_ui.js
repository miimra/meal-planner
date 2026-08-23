/// <reference path="../pb_data/types.d.ts" />

// Interaction state belongs to the Telegram message containing the callback
// button. Per-chat message IDs caused independent conversations to overwrite
// one another, so remove those obsolete pointers.
migrate((app) => {
  const chats = app.findCollectionByNameOrId("telegram_chats");
  chats.fields.removeByName("control_panel_message_id");
  chats.fields.removeByName("suggestion_card_message_id");
  app.save(chats);
}, (app) => {
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
});
