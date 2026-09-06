/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/telegram/webhook", (e) => {
  const expected = String($os.getenv("TELEGRAM_WEBHOOK_SECRET") || "");
  const provided = String(e.request.header.get("X-Telegram-Bot-Api-Secret-Token") || "");
  const valid = expected.length >= 24 && provided && $security.equal(
    $security.sha256(provided),
    $security.sha256(expected),
  );
  if (!valid) return e.json(404, {});
  const contentLength = Number(e.request.header.get("Content-Length") || 0);
  if (contentLength > 1024 * 1024) return e.json(413, {});
  try {
    const bot = require(`${__hooks}/telegram/bot.js`);
    bot.handle(e.app, e.requestInfo().body || {});
  } catch (error) {
    const code = String(error && error.message || "internal_error");
    e.app.logger().error("Telegram update failed", "error_code", /^[a-z0-9_]+$/i.test(code) ? code : "internal_error");
  }
  return e.noContent(200);
});

$app.onServe().bindFunc((e) => {
  e.next();
  try {
    const bot = require(`${__hooks}/telegram/bot.js`);
    bot.registerCommands();
  } catch (error) {
    const code = String(error && error.message || "internal_error");
    e.app.logger().error("Telegram command registration failed", "error_code", /^[a-z0-9_]+$/i.test(code) ? code : "internal_error");
  }
});

const appTimezone = String($os.getenv("APP_TIMEZONE") || "Europe/Amsterdam");
$app.cron().setTimezone(new Timezone(appTimezone));
cronAdd(
  "telegram-weekly-dinner-plan",
  String($os.getenv("TELEGRAM_WEEKLY_CRON") || "0 14 * * 0"),
  () => {
    try {
      const scheduler = require(`${__hooks}/telegram/scheduler.js`);
      const result = scheduler.sendWeekly($app);
      $app.logger().info("Telegram weekly dinner plan completed", "chats", result.chats, "sent", result.sent, "week", result.weekStart, "snoozed", result.snoozed);
    } catch (error) {
      const code = String(error && error.message || "internal_error");
      $app.logger().error("Telegram weekly dinner plan failed", "error_code", /^[a-z0-9_]+$/i.test(code) ? code : "internal_error");
    }
  },
);

// Follows up while dinners are still open, during waking hours only. The
// scheduler itself decides whether there is anything worth saying.
cronAdd(
  "telegram-plan-nudge",
  String($os.getenv("TELEGRAM_NUDGE_CRON") || "0 9-21 * * *"),
  () => {
    try {
      const scheduler = require(`${__hooks}/telegram/scheduler.js`);
      const result = scheduler.sendNudges($app);
      if (result.skipped) $app.logger().debug("Telegram plan nudge skipped", "reason", result.skipped);
      else $app.logger().info("Telegram plan nudge sent", "chats", result.chats, "sent", result.sent, "open", result.open, "snoozed", result.snoozed, "catchUp", Boolean(result.catchUp));
    } catch (error) {
      const code = String(error && error.message || "internal_error");
      $app.logger().error("Telegram plan nudge failed", "error_code", /^[a-z0-9_]+$/i.test(code) ? code : "internal_error");
    }
  },
);
