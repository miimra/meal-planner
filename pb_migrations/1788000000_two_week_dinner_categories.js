/// <reference path="../pb_data/types.d.ts" />

// The 2026-09-11 taxonomy: twelve themes, one per weekday slot across the
// two-week rotation, with Saturday eating out. Every catId keeps the concept
// it had, so past dinner assignments still point at the right theme. ID 12
// returns to Pizza (it was Pizza before Flexible Choice), and 8 narrows from
// Casual Favorites to Wraps & Sandwiches.
//
// Columns: catId, name_en, name_fa, emoji, style, effort, effort_min,
// effort_max, weekend_only, prep_ahead, notes.
const TAXONOMY_2026_09_11 = [
  [1, "Simple Pan Meals", "غذای ساده تابه‌ای", "🍳", "iranian", "quick", 15, 35, false, false,
    "One-pan dinners that come together fast. Examples: omelette (املت), tomato omelette, kuku sabzi, kuku sibzamini, bandari (eggs, sausage, potatoes), frozen falafel with tomato, tomato-eggplant-potato skillet."],
  [2, "Kebab & Grill", "کباب و گریل", "🍢", "iranian", "medium", 30, 60, false, false,
    "Iranian grilled mains served with rice or bread. Examples: joojeh kabab, joojeh sikhi, chelo kabab koobideh, kabab torsh, grilled chicken thighs."],
  [3, "Iranian Stew", "خورش ایرانی", "🍲", "iranian", "heavy", 60, 150, true, true,
    "Khoresh over rice; start early or prep ahead. Examples: ghormeh sabzi, gheymeh, fesenjoon, morgh torsh, khoresh karafs, aloo esfenaj."],
  [4, "Dami & Mixed Rice", "دمی و پلوهای مخلوط", "🍚", "iranian", "medium-heavy", 40, 90, false, false,
    "Rice cooked together with its topping. Examples: loobia polo, adas polo, dami gojeh, havij-o-morgh la polo, gharch-o-morgh la polo, tahchin, rice with minced meat, meygo polo."],
  [5, "Chicken Plate with Vegetables & Starch", "بشقاب مرغ با سبزیجات و نشاسته", "🍗", "international", "medium", 25, 55, false, false,
    "A chicken main plated with a vegetable side and one starch (potato, rice, or bread). Examples: Greek lemon-herb souvlaki with roasted vegetables, roast chicken with root vegetables, butter chicken with rice, teriyaki chicken with steamed vegetables."],
  [6, "Seafood", "ماهی و غذای دریایی", "🐟", "either", "medium", 20, 50, false, false,
    "Fish or shellfish as the main protein, in any format. Examples: salmon with vegetables, steamed fish with vegetables (khorak-e mahi), fried shrimp, shrimp pasta, meygo polo, tuna and egg. At most once a week."],
  [7, "Pasta & Noodles", "پاستا و نودل", "🍝", "international", "quick", 20, 45, false, false,
    "Pasta or noodles as the main format, with vegetables or a substantial side. Examples: Iranian makaroni, penne primavera, spinach and ricotta pasta, lasagna (prep ahead), stir-fried noodles."],
  [8, "Wraps & Sandwiches", "رپ و ساندویچ", "🌯", "either", "medium", 20, 45, false, false,
    "Handheld dinners in bread. Examples: homemade burger, chicken shawarma wrap, kotlet sandwich, chicken and vegetable tortilla wrap, soft tacos, falafel wrap."],
  [9, "Oven / One-Dish Meals", "غذای فر و یک‌ظرفه", "🥧", "either", "medium", 30, 60, false, false,
    "Baked or all-in-one dishes that finish in the oven or one pot. Examples: pirashki, samosa, kotlet with a tray of roasted vegetables, chicken and vegetable tray bake, potato gratin, casserole, stuffed peppers (dolmeh felfel)."],
  [10, "Cold Plate / Complete Salad", "بشقاب سرد و سالاد کامل", "🥗", "either", "quick", 15, 35, false, false,
    "A cold dinner that is a full meal: vegetables plus a filling protein or grain. Examples: salad olivieh, macaroni salad, potato salad, tuna and egg plate, lentil and roasted vegetable salad, sushi (often bought)."],
  [11, "Soup / Ash", "سوپ و آش", "🥣", "either", "medium", 30, 60, false, false,
    "A soup or ash as the whole dinner, with bread. Examples: ash reshteh, adasi (lentil soup), barley soup (soup-e jo), chicken and vegetable soup, abdoogh khiar in summer."],
  [12, "Pizza", "پیتزا", "🍕", "international", "medium", 30, 45, false, false,
    "Pizza night, homemade or bought. Examples: homemade vegetable and chicken pizza, mushroom pizza, calzone."],
];

const PREVIOUS_TAXONOMY = [
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

const TERMS = {
  pizza: ["pizza", "calzone", "پیتزا"],
  sushi: ["sushi", "سوشی"],
  pasta: ["pasta", "noodle", "macaroni", "lasagna", "penne", "spaghetti", "پاستا", "نودل", "ماکارونی", "لازانیا"],
  // "ماهى" is the Arabic-yeh spelling that typed-in dishes sometimes carry.
  fish: ["fish", "seafood", "shrimp", "salmon", "tuna", "cod", "prawn", "ماهی", "ماهى", "میگو", "سالمون", "تن ماهی"],
  rice: ["rice", "polo", "pilaf", "dami", "tahchin", "پلو", "دمی", "ته‌چین", "ته چین", "حواری", "برنج"],
  salad: ["salad", "سالاد"],
  oven: ["samosa", "cutlet", "kotlet", "piroski", "pirashki", "pastry", "casserole", "gratin", "tray bake", "سمبوسه", "کتلت", "پیراشکی"],
  // No bare "رپ": it is a substring of بخارپز (steamed).
  wrap: ["burger", "sandwich", "wrap", "taco", "shawarma", "همبرگر", "برگر", "ساندویچ", "شاورما"],
  egg: ["egg", "omelet", "omelette", "kuku", "bandari", "falafel", "تخم‌مرغ", "تخم مرغ", "املت", "کوکو", "بندری", "فلافل"],
  soup: ["soup", "ash ", "aash", "adasi", "abdoogh", "سوپ", "آش", "عدسی", "آبدوغ"],
  kebab: ["kebab", "kabab", "kabob", "joojeh", "کباب", "جوجه"],
  // No bare "stew": adasi is stored as "Lentil Stew" and is a soup here.
  stew: ["khoresh", "fesenj", "ghormeh", "gheymeh", "خورش", "فسنجون", "قیمه", "قورمه"],
};

// Lamb shank (ماهیچه) contains the letters of ماهی; it is not seafood.
const SHANK = ["ماهیچه"];

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

function isFish(name) {
  return includesAny(name, TERMS.fish) && !(includesAny(name, SHANK) && !includesAny(name, ["fish", "میگو", "سالمون", "تن ماهی"]));
}

function migrateDishCategories(app, categories) {
  for (const dish of app.findRecordsByFilter("dishes", "", "name", 0, 0)) {
    const name = dish.getString("name").trim().toLowerCase();
    const oldPrimary = dish.getInt("catId") || null;
    let primary = oldPrimary;
    let relations = unique(dish.getStringSlice("categories"));

    // Primary re-filing: the themes that split, narrowed, or were mis-filed.
    if (includesAny(name, TERMS.pizza)) {
      primary = 12;
      relations = removeCategoryId(removeCategoryId(relations, categories, 8), categories, 9);
    } else if (includesAny(name, TERMS.sushi)) {
      primary = 10;
      relations = removeCategoryId(relations, categories, 8);
    } else if (oldPrimary === 4 && includesAny(name, TERMS.pasta) && !includesAny(name, TERMS.rice)) {
      primary = 7;
      relations = removeCategoryId(relations, categories, 4);
    } else if (oldPrimary === 5 && isFish(name)) {
      primary = 6;
      relations = removeCategoryId(relations, categories, 5);
    } else if (oldPrimary === 6 && includesAny(name, TERMS.salad) && !isFish(name)) {
      primary = 10;
      relations = removeCategoryId(relations, categories, 6);
    } else if (oldPrimary === 11 && !includesAny(name, TERMS.soup)) {
      // The old "Simple Soups & No-Cook" held skillet dinners too; those are
      // Simple Pan Meals now, and only soups and ash stay in 11.
      primary = 1;
      relations = removeCategoryId(relations, categories, 11);
    }

    if (includesAny(name, SHANK) && !isFish(name)) relations = removeCategoryId(relations, categories, 6);

    // Relations: every theme a dish can legitimately be suggested under.
    if (primary) addCategoryId(relations, categories, primary);
    if (includesAny(name, TERMS.pasta)) addCategoryId(relations, categories, 7);
    if (isFish(name)) addCategoryId(relations, categories, 6);
    if (includesAny(name, TERMS.rice)) addCategoryId(relations, categories, 4);
    if (includesAny(name, TERMS.salad)) addCategoryId(relations, categories, 10);
    if (includesAny(name, TERMS.oven)) addCategoryId(relations, categories, 9);
    if (includesAny(name, TERMS.wrap)) addCategoryId(relations, categories, 8);
    if (includesAny(name, TERMS.egg)) addCategoryId(relations, categories, 1);
    if (includesAny(name, TERMS.soup)) addCategoryId(relations, categories, 11);
    if (includesAny(name, TERMS.kebab)) addCategoryId(relations, categories, 2);
    if (includesAny(name, TERMS.stew)) addCategoryId(relations, categories, 3);
    if (includesAny(name, TERMS.pizza)) addCategoryId(relations, categories, 12);

    if (primary !== oldPrimary) dish.set("catId", primary);
    dish.set("categories", relations);
    app.save(dish);
  }
}

migrate((app) => {
  const categories = applyTaxonomy(app, TAXONOMY_2026_09_11);
  migrateDishCategories(app, categories);
}, (app) => {
  const categories = applyTaxonomy(app, PREVIOUS_TAXONOMY);
  // Only the moves that depended on the new taxonomy are reversed; the
  // corrected mis-filings (fish, pasta, salad, skillet dinners) stay corrected.
  for (const dish of app.findRecordsByFilter("dishes", "", "name", 0, 0)) {
    const name = dish.getString("name").trim().toLowerCase();
    let primary = dish.getInt("catId") || null;
    let relations = unique(dish.getStringSlice("categories"));
    if (primary === 12 && includesAny(name, TERMS.pizza)) {
      primary = 8;
      relations = removeCategoryId(relations, categories, 12);
      addCategoryId(relations, categories, 8);
      addCategoryId(relations, categories, 9);
    }
    if (primary === 10 && includesAny(name, TERMS.sushi)) {
      primary = 8;
      relations = removeCategoryId(relations, categories, 10);
      addCategoryId(relations, categories, 8);
    }
    dish.set("catId", primary);
    dish.set("categories", relations);
    app.save(dish);
  }
});
