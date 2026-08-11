"use strict";

const PROMPT_VERSION = "telegram-v4";

function messages(context, meals, preferences, excludedPreferences) {
  return [
    {
      role: "system",
      content: [
        "You plan meals for one household.",
        "Return JSON only, with no Markdown.",
        "Suggest one exact dish for each requested meal.",
        "Every dish and ingredient quantity must serve exactly two adults and one baby.",
        "Every dish must be baby-safe and include a short dish-specific babyServing instruction.",
        "Set aside the baby's portion before adult seasoning and use a soft age-appropriate texture without obvious choking forms.",
        "Do not use honey, undercooked eggs/meat/fish, or unpasteurized ingredients.",
        "Use no chili or spicy heat.",
        "Make meals vegetable-forward with generous vegetables.",
        "Use little added salt and sugar; prefer herbs, lemon, and naturally flavorful ingredients.",
        "The supplied dinnerCategory is the highest-priority planning rule and the dinner must clearly belong to it.",
        "Never blend in a conflicting food type merely to satisfy a user preference.",
        "Breakfast and lunch have no category and must be very simple: easy difficulty, no more than 20 total minutes, and no more than 8 ingredients.",
        "Avoid dishes already assigned in the supplied Monday-Sunday week.",
        "Prefer positively rated dishes, but keep variety.",
        "Follow each meal's user preference only when it is compatible with the family safety rules and dinnerCategory.",
        "Never use ingredients or food types listed in excludedPreferences.",
        "If the preference names an ingredient or food type, make it a clear part of the dish and ingredients.",
        "If the preference describes effort or time, choose a dish that genuinely matches it.",
        "Never invent an existingDishId. Use null for a newly named dish.",
        "Keep each reason to one short sentence.",
        "List practical ingredients with household quantities where useful.",
        "Difficulty must be easy, medium, or hard.",
        "prepMinutes and cookMinutes must be whole numbers from 0 to 1440.",
        "Output: {\"meals\":[{\"meal\":\"breakfast\",\"name\":\"...\",\"reason\":\"...\",\"difficulty\":\"easy\",\"prepMinutes\":5,\"cookMinutes\":10,\"ingredients\":[\"4 eggs\",\"200 g spinach\"],\"babyServing\":\"Set aside before salting; cook fully and chop to an age-appropriate soft texture.\",\"existingDishId\":null}]}",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        requestedMeals: meals,
        preferences: preferences || {},
        excludedPreferences: excludedPreferences || {},
        dinnerCategory: context && context.requested && context.requested.dinner
          ? context.requested.dinner.category || null
          : null,
        context,
      }),
    },
  ];
}

module.exports = { PROMPT_VERSION, messages };
