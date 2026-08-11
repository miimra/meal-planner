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

const appTimezone = String($os.getenv("APP_TIMEZONE") || "Europe/Amsterdam");
$app.cron().setTimezone(new Timezone(appTimezone));
cronAdd(
  "telegram-daily-meal-plan",
  String($os.getenv("TELEGRAM_DAILY_CRON") || "30 18 * * *"),
  () => {
    try {
      const scheduler = require(`${__hooks}/telegram/scheduler.js`);
      const result = scheduler.sendDaily($app);
      $app.logger().info("Telegram daily meal plan completed", "chats", result.chats, "sent", result.sent);
    } catch (error) {
      const code = String(error && error.message || "internal_error");
      $app.logger().error("Telegram daily meal plan failed", "error_code", /^[a-z0-9_]+$/i.test(code) ? code : "internal_error");
    }
  },
);
