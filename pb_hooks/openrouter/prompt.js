"use strict";

const PROMPT_VERSION = "telegram-v1";

function messages(context, meals) {
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
        "Never invent an existingDishId. Use null for a newly named dish.",
        "Keep each reason to one short sentence.",
        "Output: {\"meals\":[{\"meal\":\"breakfast\",\"name\":\"...\",\"reason\":\"...\",\"existingDishId\":null}]}",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({ requestedMeals: meals, context }),
    },
  ];
}

module.exports = { PROMPT_VERSION, messages };
