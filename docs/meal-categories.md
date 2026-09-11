# Dinner category reference

This is the canonical, Git-tracked reference for the household dinner
taxonomy introduced on 2026-09-11. PocketBase stores the active copies, while
the stable `catId` values below are referenced by the two-week rotation and
must not be reassigned casually.

Categories are broad planning themes, not mutually exclusive recipe folders.
A dish may belong to more than one category; `catId` remains its primary
category for compatibility, and the `categories` relation holds every
eligible theme. The `notes` field carries example dishes and is shown to the
household on the web app's Categories page and given to the model as a
selection constraint.

| ID | Emoji | English | Persian | Style | Effort | Examples |
| ---: | :---: | --- | --- | --- | --- | --- |
| 1 | 🍳 | Simple Pan Meals | غذای ساده تابه‌ای | Iranian | Quick, 15–35 min | Omelette, tomato omelette, kuku sabzi, kuku sibzamini, bandari, frozen falafel with tomato, tomato-eggplant-potato skillet. |
| 2 | 🍢 | Kebab & Grill | کباب و گریل | Iranian | Medium, 30–60 min | Joojeh kabab, joojeh sikhi, chelo kabab koobideh, kabab torsh, grilled chicken thighs. |
| 3 | 🍲 | Iranian Stew | خورش ایرانی | Iranian | Heavy, 60–150 min, weekend, prep ahead | Ghormeh sabzi, gheymeh, fesenjoon, morgh torsh, khoresh karafs, aloo esfenaj. |
| 4 | 🍚 | Dami & Mixed Rice | دمی و پلوهای مخلوط | Iranian | Medium–heavy, 40–90 min | Loobia polo, adas polo, dami gojeh, havij-o-morgh la polo, gharch-o-morgh la polo, tahchin, rice with minced meat, meygo polo. |
| 5 | 🍗 | Chicken Plate with Vegetables & Starch | بشقاب مرغ با سبزیجات و نشاسته | International | Medium, 25–55 min | Souvlaki with roasted vegetables, roast chicken with root vegetables, butter chicken with rice, teriyaki chicken with steamed vegetables. |
| 6 | 🐟 | Seafood | ماهی و غذای دریایی | Either | Medium, 20–50 min | Salmon with vegetables, steamed fish with vegetables, fried shrimp, shrimp pasta, meygo polo, tuna and egg. At most once a week. |
| 7 | 🍝 | Pasta & Noodles | پاستا و نودل | International | Quick, 20–45 min | Iranian makaroni, penne primavera, spinach and ricotta pasta, lasagna (prep ahead), stir-fried noodles. |
| 8 | 🌯 | Wraps & Sandwiches | رپ و ساندویچ | Either | Medium, 20–45 min | Homemade burger, chicken shawarma wrap, kotlet sandwich, tortilla wrap, soft tacos, falafel wrap. |
| 9 | 🥧 | Oven / One-Dish Meals | غذای فر و یک‌ظرفه | Either | Medium, 30–60 min | Pirashki, samosa, kotlet with roasted vegetables, chicken and vegetable tray bake, potato gratin, casserole, stuffed peppers. |
| 10 | 🥗 | Cold Plate / Complete Salad | بشقاب سرد و سالاد کامل | Either | Quick, 15–35 min | Salad olivieh, macaroni salad, potato salad, tuna and egg plate, lentil and roasted vegetable salad, sushi. |
| 11 | 🥣 | Soup / Ash | سوپ و آش | Either | Medium, 30–60 min | Ash reshteh, adasi, barley soup, chicken and vegetable soup, abdoogh khiar in summer. |
| 12 | 🍕 | Pizza | پیتزا | International | Medium, 30–45 min | Homemade vegetable and chicken pizza, mushroom pizza, calzone. |

## Two-week dinner rotation

Only dinner is planned. Saturday is always eating out. Sunday is a fixed theme
in each week rather than a choice.

| | Monday | Tuesday | Wednesday | Thursday | Friday | Saturday | Sunday |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Week 1 | 🍕 Pizza | 🥗 Cold Plate / Complete Salad | 🍝 Pasta & Noodles | 🐟 Seafood | 🍢 Kebab & Grill | Eat out | 🍲 Iranian Stew |
| Week 2 | 🍗 Chicken Plate with Vegetables & Starch | 🥣 Soup / Ash | 🌯 Wraps & Sandwiches | 🥧 Oven / One-Dish Meals | 🍚 Dami & Mixed Rice | Eat out | 🍳 Simple Pan Meals |

As `catId` values: week 1 is `12, 10, 7, 6, 2, –, 3` and week 2 is
`5, 11, 8, 9, 4, –, 1`. Week 1 is any week whose Monday is an even number of
weeks after Monday 2024-01-01; `pb_hooks/meal_planning/calendar.js` and
`app/lib/rotation.ts` both encode the same tables.

## Selection rules

- The visible category is the dinner theme, and the dinner must clearly belong
  to it. There is no free-choice slot.
- Multi-category recipes are eligible in every related theme. For example,
  shrimp pasta can appear under both Seafood and Pasta & Noodles, and meygo
  polo under both Seafood and Dami & Mixed Rice.
- The category notes list example dishes; effort ranges and notes are
  recommendation inputs, not only display labels.
- Exact household recipes, feedback, recent cooking, saved recipes, and the
  current week's plan still determine ranking within a theme.

## Replacement mapping

The 2026-09-11 production migration retained every category record and `catId`
so historical meal assignments remained valid. Each ID kept its concept:

| ID | Was | Now |
| ---: | --- | --- |
| 1 | Quick Iranian | Simple Pan Meals |
| 2 | Iranian Grills | Kebab & Grill (no longer weekend-only; it is a Friday) |
| 3 | Iranian Stews & Slow Dishes | Iranian Stew |
| 4 | Iranian Rice & Dami | Dami & Mixed Rice |
| 5 | International Mains | Chicken Plate with Vegetables & Starch |
| 6 | Seafood | Seafood |
| 7 | Pasta & Noodles | Pasta & Noodles |
| 8 | Casual Favorites | Wraps & Sandwiches (burgers stay; pizza and sushi move) |
| 9 | Handheld & Oven Meals | Oven / One-Dish Meals |
| 10 | Salads & Light Plates | Cold Plate / Complete Salad (sushi joins) |
| 11 | Simple Soups & No-Cook | Soup / Ash (skillet dinners move to 1) |
| 12 | Flexible Choice | Pizza |

The same migration corrected mis-filed dishes: pizza to 12, sushi to 10,
ricotta pasta from 4 to 7, a typed-in fish from 5 to 6, macaroni salad from 6
to 10, tomato omelette and the tomato-eggplant-potato skillet from 11 to 1,
and it removed the false Seafood relation from lamb shank (ماهیچه).
