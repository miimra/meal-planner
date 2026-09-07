/// <reference path="../pb_data/types.d.ts" />

// Once a week's dinners are all decided, its weekly-plan message is pinned
// and frozen instead of staying a live, editable panel. `pinned` marks a
// weekly delivery run as already handled so a chat is not re-pinned on every
// later tick, and `pinned_message_id` remembers which message is currently
// pinned in a chat so the previous week's pin can be removed first.
migrate((app) => {
  const runs = app.findCollectionByNameOrId("telegram_delivery_runs");
  runs.fields.add(new BoolField({
    name: "pinned",
  }));
  app.save(runs);

  const chats = app.findCollectionByNameOrId("telegram_chats");
  chats.fields.add(new TextField({
    name: "pinned_message_id",
    max: 40,
  }));
  app.save(chats);
}, (app) => {
  const runs = app.findCollectionByNameOrId("telegram_delivery_runs");
  runs.fields.removeByName("pinned");
  app.save(runs);

  const chats = app.findCollectionByNameOrId("telegram_chats");
  chats.fields.removeByName("pinned_message_id");
  app.save(chats);
});
