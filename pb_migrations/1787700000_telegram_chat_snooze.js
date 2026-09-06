/// <reference path="../pb_data/types.d.ts" />

// Lets a chat postpone the weekly plan and hourly nudge for a chosen period
// without switching the reminder off entirely.
migrate((app) => {
  const chats = app.findCollectionByNameOrId("telegram_chats");
  chats.fields.add(new DateField({
    name: "snoozed_until",
  }));
  app.save(chats);
}, (app) => {
  const chats = app.findCollectionByNameOrId("telegram_chats");
  chats.fields.removeByName("snoozed_until");
  app.save(chats);
});
