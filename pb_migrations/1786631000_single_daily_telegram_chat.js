/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const enabled = app.findRecordsByFilter(
    "telegram_chats",
    "daily_enabled = true",
    "-updated",
    0,
    0,
  );
  let selected = null;
  let selectedScore = -1;
  for (const chat of enabled) {
    const group = ["group", "supergroup"].indexOf(chat.getString("type")) !== -1;
    const score = (chat.getBool("active") ? 2 : 0) + (group ? 1 : 0);
    if (score > selectedScore) {
      selected = chat;
      selectedScore = score;
    }
  }
  for (const chat of enabled) {
    if (selected && chat.id === selected.id) continue;
    chat.set("daily_enabled", false);
    app.save(chat);
  }

  const collection = app.findCollectionByNameOrId("telegram_chats");
  collection.indexes.push(
    "CREATE UNIQUE INDEX idx_telegram_chats_single_daily ON telegram_chats (daily_enabled) WHERE daily_enabled = TRUE",
  );
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("telegram_chats");
  collection.indexes = collection.indexes.filter((value) => (
    value.indexOf("idx_telegram_chats_single_daily") === -1
  ));
  app.save(collection);
});
