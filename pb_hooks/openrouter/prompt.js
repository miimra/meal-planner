"use strict";

const PROMPT_VERSION = "telegram-v2";

function messages(context, meals, preferences) {
  return [
    {
      role: "system",
      content: [
        "You plan meals for one household.",
        "Return JSON only, with no Markdown.",
        "Suggest one exact dish for each requested meal.",
        "Respect the supplied dinner category when it is present.",
        "Breakfast and lunch may be selected by meal type when category is null.",
        "Avoid dishes already assigned in the supplied Monday-Sunday week.",
        "Prefer positively rated dishes, but keep variety.",
        "Strictly follow each meal's user preference when supplied.",
        "If the preference names an ingredient or food type, make it a clear part of the dish and ingredients.",
        "If the preference describes effort or time, choose a dish that genuinely matches it.",
        "Never invent an existingDishId. Use null for a newly named dish.",
        "Keep each reason to one short sentence.",
        "List practical ingredients with household quantities where useful.",
        "Difficulty must be easy, medium, or hard.",
        "prepMinutes and cookMinutes must be whole numbers from 0 to 1440.",
        "Output: {\"meals\":[{\"meal\":\"breakfast\",\"name\":\"...\",\"reason\":\"...\",\"difficulty\":\"easy\",\"prepMinutes\":10,\"cookMinutes\":15,\"ingredients\":[\"4 eggs\",\"100 g spinach\"],\"existingDishId\":null}]}",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({ requestedMeals: meals, preferences: preferences || {}, context }),
    },
  ];
}

module.exports = { PROMPT_VERSION, messages };
