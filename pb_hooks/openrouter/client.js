"use strict";

const prompt = require(`${__hooks}/openrouter/prompt.js`);
const response = require(`${__hooks}/openrouter/response.js`);

function config() {
  const apiKey = String($os.getenv("OPENROUTER_API_KEY") || "").trim();
  const model = String($os.getenv("OPENROUTER_MODEL") || "").trim();
  if (!apiKey || !model) throw new Error("openrouter_not_configured");
  return {
    apiKey,
    model,
    baseUrl: String($os.getenv("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
    siteUrl: String($os.getenv("PUBLIC_BASE_URL") || "https://meal.number34.nl"),
  };
}

function request(context, meals) {
  const cfg = config();
  const result = $http.send({
    method: "POST",
    url: cfg.baseUrl + "/chat/completions",
    timeout: 45,
    headers: {
      Authorization: "Bearer " + cfg.apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer": cfg.siteUrl,
      "X-Title": "Household Meal Planner",
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.65,
      messages: prompt.messages(context, meals),
      response_format: { type: "json_object" },
    }),
  });
  if (result.statusCode < 200 || result.statusCode >= 300) throw new Error("openrouter_request_failed");
  const choice = result.json && result.json.choices && result.json.choices[0];
  const content = choice && choice.message ? choice.message.content : null;
  return { meals: response.validateResponse(content, meals), model: cfg.model };
}

function generate(context, meals) {
  try {
    return request(context, meals);
  } catch (error) {
    if (String(error && error.message) !== "invalid_ai_response") throw error;
    return request(context, meals);
  }
}

module.exports = { config, generate };
