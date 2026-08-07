// pb_migrations/1754524800_categories_and_dishes.js
migrate((app) => {
  const categories = new Collection({
    type: "base",
    name: "categories",
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: "@request.auth.id != ''",
    deleteRule: null,
    fields: [
      { type: "number", name: "catId", required: true, onlyInt: true },
      { type: "text", name: "name_en", required: true },
      { type: "text", name: "name_fa", required: true },
      { type: "text", name: "emoji", required: true },
      {
        type: "select",
        name: "style",
        required: true,
        values: ["iranian", "international", "either"],
        maxSelect: 1,
      },
      {
        type: "select",
        name: "effort",
        required: true,
        values: ["quick", "medium", "medium-heavy", "heavy"],
        maxSelect: 1,
      },
      { type: "number", name: "effort_min", required: true, onlyInt: true },
      { type: "number", name: "effort_max", required: true, onlyInt: true },
      { type: "bool", name: "weekend_only" },
      { type: "bool", name: "prep_ahead" },
      { type: "text", name: "notes" },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_categories_catId ON categories (catId)"],
  });
  app.save(categories);

  const dishes = new Collection({
    type: "base",
    name: "dishes",
    listRule: "",
    viewRule: "",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      { type: "number", name: "catId", required: true, onlyInt: true },
      { type: "text", name: "name", required: true },
      { type: "text", name: "notes" },
    ],
    indexes: ["CREATE INDEX idx_dishes_catId ON dishes (catId)"],
  });
  app.save(dishes);

  const CATEGORY_SEED = [
    {
      catId: 1, name_en: "Bandari & Eggs", name_fa: "بندری و تخم‌مرغی", emoji: "🍳",
      style: "iranian", effort: "quick", effort_min: 20, effort_max: 30,
      dishes: ["بندری (eggs + sausage + potatoes)", "تخم‌مرغ سوسیس", "تخم‌مرغ سیب‌زمینی", "املت", "کوکو سیب‌زمینی", "کوکو سبزی", "فلافل (frozen)"],
    },
    {
      catId: 2, name_en: "Iranian Grilled", name_fa: "کبابی ایرانی", emoji: "🍢",
      style: "iranian", effort: "medium", effort_min: 30, effort_max: 45, weekend_only: true,
      dishes: ["جوجه کباب", "جوجه سیخی", "کباب ترش", "چلوکباب"],
    },
    {
      catId: 3, name_en: "Heavy Iranian Stews", name_fa: "خورشت‌های سنگین", emoji: "🍲",
      style: "iranian", effort: "heavy", effort_min: 60, effort_max: 120, weekend_only: true, prep_ahead: true,
      dishes: ["فسنجون", "مرغ ترش", "انواع خورش‌ها (Various stews)", "پلو ماهیچه"],
    },
    {
      catId: 4, name_en: "Layered Rice & Dami", name_fa: "لا پلو و دمی", emoji: "🍚",
      style: "iranian", effort: "medium-heavy", effort_min: 45, effort_max: 90,
      dishes: ["هویج و مرغ لا پلو", "قارچ و مرغ لا پلو", "ته‌چین", "لوبیا پلو", "عدس پلو", "دمی گوجه"],
    },
    {
      catId: 5, name_en: "International Chicken/Meat", name_fa: "مرغ/گوشت بین‌المللی", emoji: "🍗",
      style: "international", effort: "medium", effort_min: 30, effort_max: 45,
      dishes: ["بیف استراگانف (Beef Stroganoff)", "باتر چیکن (Butter Chicken)", "تریاکی (Teriyaki)", "مرغ سوخاری (Fried Chicken)"],
    },
    {
      catId: 6, name_en: "Fish & Shrimp", name_fa: "ماهی و میگو", emoji: "🐟",
      style: "either", effort: "medium", effort_min: 25, effort_max: 45,
      notes: "Fish weekly at most. Shrimp is frozen.",
      dishes: ["ماهی (Fish)", "میگو پاستا (Shrimp Pasta)", "میگو سوخاری (Fried Shrimp)", "حواری (Shrimp Rice / Meygo Polo)"],
    },
    {
      catId: 7, name_en: "Pasta & Noodles", name_fa: "پاستا و نودل", emoji: "🍝",
      style: "international", effort: "quick", effort_min: 20, effort_max: 45,
      notes: "Pasta needs a side (salad, boiled egg, or veggies) — don't serve carbs alone.",
      dishes: ["ماکارونی (Amir's favorite)", "پاستا", "نودل", "لازانیا (heavy — pre-cook)"],
    },
    {
      catId: 8, name_en: "Burgers & Sushi", name_fa: "همبرگر و سوشی", emoji: "🍔",
      style: "international", effort: "medium", effort_min: 30, effort_max: 45,
      dishes: ["همبرگر (Burger)", "سوشی (Sushi — often bought)"],
    },
    {
      catId: 9, name_en: "Pastries & Baked", name_fa: "خمیری و تنوری", emoji: "🥟",
      style: "iranian", effort: "medium", effort_min: 30, effort_max: 45,
      dishes: ["پیراشکی", "سمبوسه", "کتلت"],
    },
    {
      catId: 10, name_en: "Salad as Meal", name_fa: "سالاد به‌عنوان وعده", emoji: "🥗",
      style: "either", effort: "quick", effort_min: 15, effort_max: 30,
      dishes: ["سالاد ماکارونی (Macaroni Salad)", "سالاد اولویه (Olivieh Salad)", "سالاد سیب‌زمینی (Potato Salad)"],
    },
    {
      catId: 11, name_en: "Cold & Simple", name_fa: "سرد و راحت", emoji: "🌡️",
      style: "iranian", effort: "quick", effort_min: 10, effort_max: 30,
      dishes: ["آبدوغ خیار (Abdoogh Khiar)", "عدسی (Lentil Stew)"],
    },
    {
      catId: 12, name_en: "Pizza", name_fa: "پیتزا", emoji: "🍕",
      style: "international", effort: "medium", effort_min: 30, effort_max: 45,
      notes: "Homemade or takeaway",
      dishes: [],
    },
  ];

  for (const c of CATEGORY_SEED) {
    const record = new Record(categories);
    record.set("catId", c.catId);
    record.set("name_en", c.name_en);
    record.set("name_fa", c.name_fa);
    record.set("emoji", c.emoji);
    record.set("style", c.style);
    record.set("effort", c.effort);
    record.set("effort_min", c.effort_min);
    record.set("effort_max", c.effort_max);
    if (c.weekend_only) record.set("weekend_only", true);
    if (c.prep_ahead) record.set("prep_ahead", true);
    if (c.notes) record.set("notes", c.notes);
    app.save(record);

    for (const name of c.dishes) {
      const dish = new Record(dishes);
      dish.set("catId", c.catId);
      dish.set("name", name);
      app.save(dish);
    }
  }
}, (app) => {
  app.delete(app.findCollectionByNameOrId("dishes"));
  app.delete(app.findCollectionByNameOrId("categories"));
});
