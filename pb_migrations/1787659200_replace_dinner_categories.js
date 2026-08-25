/// <reference path="../pb_data/types.d.ts" />

const TAXONOMY_2026_08_25 = [
  [1, "Quick Iranian", "غذای سریع ایرانی", "🍳", "iranian", "quick", 15, 35, false, false, "Eggs, kuku, falafel, bandari, and other low-effort Iranian dinners."],
  [2, "Iranian Grills", "کباب‌های ایرانی", "🍢", "iranian", "medium", 30, 60, true, false, "Kebabs, joojeh, and other Iranian grilled mains."],
  [3, "Iranian Stews & Slow Dishes", "خورشت و غذای آرام‌پز ایرانی", "🍲", "iranian", "heavy", 60, 150, true, true, "Khoresh and other longer-cooking Iranian weekend dishes; prep ahead when useful."],
  [4, "Iranian Rice & Dami", "پلو و دمی ایرانی", "🍚", "iranian", "medium-heavy", 40, 90, false, false, "Polo, dami, tahchin, and one-pot or layered rice dishes."],
  [5, "International Mains", "غذای اصلی بین‌المللی", "🌍", "international", "medium", 25, 55, false, false, "International chicken, meat, vegetarian, curry, tray-bake, and stir-fry mains."],
  [6, "Seafood", "ماهی و غذاهای دریایی", "🐟", "either", "medium", 20, 50, false, false, "Fish or shellfish must be the main protein; pasta and rice preparations are allowed. Aim for at most once per week."],
  [7, "Pasta & Noodles", "پاستا و نودل", "🍝", "international", "quick", 20, 45, false, false, "Pasta or noodles must be the main format; include vegetables or a substantial side."],
  [8, "Casual Favorites", "غذاهای خودمانی و محبوب", "🍔", "either", "medium", 20, 60, false, false, "Burgers, sushi, pizza, wraps, tacos, and similar relaxed family dinners; homemade or bought."],
  [9, "Handheld & Oven Meals", "غذای دستی و تنوری", "🥟", "either", "medium", 25, 60, false, false, "Savory pastries, samosas, patties, baked dishes, and other handheld or oven-friendly meals."],
  [10, "Salads & Light Plates", "سالاد و بشقاب سبک", "🥗", "either", "quick", 15, 35, false, false, "A complete lighter dinner built around vegetables plus a satisfying protein or grain; not only a side salad."],
  [11, "Simple Soups & No-Cook", "سوپ و غذای ساده", "🥣", "either", "quick", 10, 35, false, false, "Soups, lentils, no-cook plates, and other genuinely simple dinners."],
  [12, "Flexible Choice", "انتخاب آزاد", "✨", "either", "medium", 10, 90, false, false, "No cuisine or format restriction. Prefer a liked family dish or a saved recipe that has not been tried yet."],
];

const PREVIOUS_TAXONOMY = [
  [1, "Bandari & Eggs", "بندری و تخم‌مرغی", "🍳", "iranian", "quick", 20, 30, false, false, ""],
  [2, "Iranian Grilled", "کبابی ایرانی", "🍢", "iranian", "medium", 30, 45, true, false, ""],
  [3, "Heavy Iranian Stews", "خورشت‌های سنگین", "🍲", "iranian", "heavy", 60, 120, true, true, ""],
  [4, "Layered Rice & Dami", "لا پلو و دمی", "🍚", "iranian", "medium-heavy", 45, 90, false, false, ""],
  [5, "International Chicken/Meat", "مرغ/گوشت بین‌المللی", "🍗", "international", "medium", 30, 45, false, false, ""],
  [6, "Fish & Shrimp", "ماهی و میگو", "🐟", "either", "medium", 25, 45, false, false, "Fish weekly at most. Shrimp is frozen."],
  [7, "Pasta & Noodles", "پاستا و نودل", "🍝", "international", "quick", 20, 45, false, false, "Pasta needs a side (salad, boiled egg, or veggies) — don't serve carbs alone."],
  [8, "Burgers & Sushi", "همبرگر و سوشی", "🍔", "international", "medium", 30, 45, false, false, ""],
  [9, "Pastries & Baked", "خمیری و تنوری", "🥟", "iranian", "medium", 30, 45, false, false, ""],
  [10, "Salad as Meal", "سالاد به‌عنوان وعده", "🥗", "either", "quick", 15, 30, false, false, ""],
  [11, "Cold & Simple", "سرد و راحت", "🌡️", "iranian", "quick", 10, 30, false, false, ""],
  [12, "Pizza", "پیتزا", "🍕", "international", "medium", 30, 45, false, false, "Homemade or takeaway"],
];

function categoryIndex(app) {
  const byId = {};
  for (const category of app.findRecordsByFilter("categories", "", "catId", 0, 0)) {
    byId[category.getInt("catId")] = category;
  }
  return byId;
}

function applyTaxonomy(app, definitions) {
  const categories = categoryIndex(app);
  for (const item of definitions) {
    const category = categories[item[0]];
    if (!category) throw new Error("missing_category_" + item[0]);
    category.set("name_en", item[1]);
    category.set("name_fa", item[2]);
    category.set("emoji", item[3]);
    category.set("style", item[4]);
    category.set("effort", item[5]);
    category.set("effort_min", item[6]);
    category.set("effort_max", item[7]);
    category.set("weekend_only", item[8]);
    category.set("prep_ahead", item[9]);
    category.set("notes", item[10]);
    app.save(category);
  }
  return categories;
}

function includesAny(value, terms) {
  return terms.some((term) => value.indexOf(term) !== -1);
}

function unique(values) {
  return values.filter((value, index) => Boolean(value) && values.indexOf(value) === index);
}

function addCategoryId(relationIds, categories, catId) {
  if (categories[catId] && relationIds.indexOf(categories[catId].id) === -1) {
    relationIds.push(categories[catId].id);
  }
}

function removeCategoryId(relationIds, categories, catId) {
  if (!categories[catId]) return relationIds;
  return relationIds.filter((id) => id !== categories[catId].id);
}

function migrateDishCategories(app, categories) {
  for (const dish of app.findRecordsByFilter("dishes", "", "name", 0, 0)) {
    const name = dish.getString("name").trim().toLowerCase();
    const oldPrimary = dish.getInt("catId") || null;
    let primary = oldPrimary;
    let relations = unique(dish.getStringSlice("categories"));

    if (oldPrimary === 12) {
      primary = 8;
      relations = removeCategoryId(relations, categories, 12);
    }
    if (oldPrimary === 6 && includesAny(name, ["خورش فسنجون", "خورشت فسنجون"])) {
      primary = 3;
      relations = removeCategoryId(relations, categories, 6);
    }
    if (oldPrimary === 9 && includesAny(name, ["salmon", "سالمون"])) {
      primary = 6;
      relations = removeCategoryId(relations, categories, 9);
    }

    if (primary) addCategoryId(relations, categories, primary);
    if (includesAny(name, ["pasta", "noodle", "macaroni", "lasagna", "پاستا", "نودل", "ماکارونی", "لازانیا"])) {
      addCategoryId(relations, categories, 7);
    }
    if (includesAny(name, ["fish", "seafood", "shrimp", "salmon", "tuna", "cod", "prawn", "ماهی", "میگو", "سالمون"])) {
      addCategoryId(relations, categories, 6);
    }
    if (includesAny(name, ["rice", "polo", "pilaf", "dami", "tahchin", "پلو", "دمی", "ته‌چین", "ته چین", "حواری"])) {
      addCategoryId(relations, categories, 4);
    }
    if (includesAny(name, ["pizza", "پیتزا"])) {
      addCategoryId(relations, categories, 8);
      addCategoryId(relations, categories, 9);
    }
    if (includesAny(name, ["salad", "سالاد"])) addCategoryId(relations, categories, 10);
    if (includesAny(name, ["samosa", "cutlet", "kotlet", "piroski", "pastry", "سمبوسه", "کتلت", "پیراشکی"])) {
      addCategoryId(relations, categories, 9);
    }

    if (primary !== oldPrimary) dish.set("catId", primary);
    dish.set("categories", relations);
    app.save(dish);
  }
}

migrate((app) => {
  const categories = applyTaxonomy(app, TAXONOMY_2026_08_25);
  migrateDishCategories(app, categories);
}, (app) => {
  const categories = applyTaxonomy(app, PREVIOUS_TAXONOMY);
  for (const dish of app.findRecordsByFilter("dishes", "", "name", 0, 0)) {
    const name = dish.getString("name").trim().toLowerCase();
    let primary = dish.getInt("catId") || null;
    let relations = unique(dish.getStringSlice("categories"));
    if (primary === 8 && includesAny(name, ["pizza", "پیتزا"])) {
      primary = 12;
      relations = removeCategoryId(relations, categories, 8);
      addCategoryId(relations, categories, 12);
    }
    if (primary === 3 && includesAny(name, ["خورش فسنجون", "خورشت فسنجون"])) {
      primary = 6;
      addCategoryId(relations, categories, 6);
    }
    if (primary === 6 && includesAny(name, ["salmon", "سالمون"])) {
      primary = 9;
      addCategoryId(relations, categories, 9);
    }
    dish.set("catId", primary);
    dish.set("categories", relations);
    app.save(dish);
  }
});
