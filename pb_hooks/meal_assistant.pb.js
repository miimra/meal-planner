/// <reference path="../pb_data/types.d.ts" />

function mealAssistantAuth(e) {
  const auth = require(`${__hooks}/meal_assistant/auth.js`);
  return auth.middleware(e);
}

function githubSyncAuth(e) {
  const auth = require(`${__hooks}/meal_assistant/auth.js`);
  return auth.userOrAssistantMiddleware(e);
}

routerAdd("GET", "/api/meal-assistant/context", (e) => {
  const service = require(`${__hooks}/meal_assistant/service.js`);
  try {
    return service.context(e);
  } catch (error) {
    if (error && error.status === 400) throw new BadRequestError(error.message);
    throw error;
  }
}, mealAssistantAuth);

routerAdd("POST", "/api/meal-assistant/assign", (e) => {
  const service = require(`${__hooks}/meal_assistant/service.js`);
  try {
    return service.assign(e);
  } catch (error) {
    if (error && error.status === 400) throw new BadRequestError(error.message);
    throw error;
  }
}, mealAssistantAuth);

routerAdd("POST", "/api/meal-assistant/feedback", (e) => {
  const service = require(`${__hooks}/meal_assistant/service.js`);
  try {
    return service.feedback(e);
  } catch (error) {
    if (error && error.status === 400) throw new BadRequestError(error.message);
    throw error;
  }
}, mealAssistantAuth);

routerAdd("POST", "/api/meal-assistant/photo", (e) => {
  const service = require(`${__hooks}/meal_assistant/service.js`);
  try {
    return service.photo(e);
  } catch (error) {
    if (error && error.status === 400) throw new BadRequestError(error.message);
    throw error;
  }
}, mealAssistantAuth, $apis.bodyLimit(25 * 1024 * 1024));

routerAdd("GET", "/api/meal-assistant/photo/{kind}/{recordId}/{filename}", (e) => {
  const service = require(`${__hooks}/meal_assistant/service.js`);
  return service.photoDownload(e);
}, mealAssistantAuth);

routerAdd("POST", "/api/meal-assistant/suggestion", (e) => {
  const service = require(`${__hooks}/meal_assistant/service.js`);
  try {
    return service.suggestion(e);
  } catch (error) {
    if (error && error.status === 400) throw new BadRequestError(error.message);
    throw error;
  }
}, mealAssistantAuth);

routerAdd("POST", "/api/internal/github-sync", (e) => {
  e.response.header().set("Cache-Control", "private, no-store");
  const service = require(`${__hooks}/github_sync/service.js`);
  return e.json(200, service.runForRequest(e.app));
}, githubSyncAuth);

// PocketBase owns the scheduler, so the same import service is used for both
// manual and scheduled runs. The timezone keeps 06:00 stable across DST.
const mealSyncTimezone = $os.getenv("MEAL_DATA_SYNC_TIMEZONE") || "Europe/Amsterdam";
$app.cron().setTimezone(new Timezone(mealSyncTimezone));
cronAdd(
  "github-meal-data-sync",
  $os.getenv("MEAL_DATA_SYNC_CRON") || "0 6 * * *",
  () => {
    const service = require(`${__hooks}/github_sync/service.js`);
    try {
      service.run($app, { trigger: "scheduled" });
    } catch (_) {
      // The service records a credential-free structured error before rethrowing.
    }
  },
);
