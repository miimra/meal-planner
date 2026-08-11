/// <reference path="../pb_data/types.d.ts" />

function mealAssistantAuth(e) {
  const auth = require(`${__hooks}/meal_assistant/auth.js`);
  return auth.middleware(e);
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
