# Dinner category reference

This is the canonical, Git-tracked reference for the household dinner
taxonomy introduced on 2026-08-25. PocketBase stores the active copies, while
the stable `catId` values below are referenced by the two-week rotation and
must not be reassigned casually.

Categories are broad planning themes, not mutually exclusive recipe folders.
A dish may belong to more than one category; `catId` remains its primary
category for compatibility, and the `categories` relation holds every
eligible theme.

| ID | Emoji | English | Persian | Style | Effort | Intent |
| ---: | :---: | --- | --- | --- | --- | --- |
| 1 | 🍳 | Quick Iranian | غذای سریع ایرانی | Iranian | Quick, 15–35 min | Eggs, kuku, falafel, bandari, and other low-effort Iranian dinners. |
| 2 | 🍢 | Iranian Grills | کباب‌های ایرانی | Iranian | Medium, 30–60 min | Kebabs, joojeh, and other Iranian grilled mains. Weekend only. |
| 3 | 🍲 | Iranian Stews & Slow Dishes | خورشت و غذای آرام‌پز ایرانی | Iranian | Heavy, 60–150 min | Khoresh and other longer-cooking Iranian weekend dishes. Prep ahead when useful. |
| 4 | 🍚 | Iranian Rice & Dami | پلو و دمی ایرانی | Iranian | Medium–heavy, 40–90 min | Polo, dami, tahchin, and one-pot or layered rice dishes. |
| 5 | 🌍 | International Mains | غذای اصلی بین‌المللی | International | Medium, 25–55 min | International chicken, meat, vegetarian, curry, tray-bake, and stir-fry mains. |
| 6 | 🐟 | Seafood | ماهی و غذاهای دریایی | Either | Medium, 20–50 min | Fish or shellfish as the main protein; pasta and rice preparations are allowed. |
| 7 | 🍝 | Pasta & Noodles | پاستا و نودل | International | Quick, 20–45 min | Pasta or noodles as the main format, with vegetables or a substantial side. |
| 8 | 🍔 | Casual Favorites | غذاهای خودمانی و محبوب | Either | Medium, 20–60 min | Burgers, sushi, pizza, wraps, tacos, and similar relaxed family dinners, homemade or bought. |
| 9 | 🥟 | Handheld & Oven Meals | غذای دستی و تنوری | Either | Medium, 25–60 min | Savory pastries, samosas, patties, baked dishes, and other handheld or oven-friendly meals. |
| 10 | 🥗 | Salads & Light Plates | سالاد و بشقاب سبک | Either | Quick, 15–35 min | Complete lighter dinners built around vegetables plus a satisfying protein or grain. |
| 11 | 🥣 | Simple Soups & No-Cook | سوپ و غذای ساده | Either | Quick, 10–35 min | Soups, lentils, no-cook plates, and other genuinely simple dinners. |
| 12 | ✨ | Flexible Choice | انتخاب آزاد | Either | Medium, 10–90 min | No cuisine or format restriction; prefer a liked family dish or an untried saved recipe. |

## Two-week dinner rotation

| | Monday | Tuesday | Wednesday | Thursday | Friday | Saturday | Sunday |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Week 1 | International Mains | Quick Iranian | Seafood | Iranian Rice & Dami | Pasta & Noodles | Eat out | Iranian Grills or Iranian Stews & Slow Dishes |
| Week 2 | Flexible Choice | Simple Soups & No-Cook | Salads & Light Plates | Handheld & Oven Meals | Casual Favorites | Eat out | Iranian Grills or Iranian Stews & Slow Dishes |

## Selection rules

- The visible category remains the main dinner theme, except Flexible Choice,
  which deliberately allows the full eligible library.
- Multi-category recipes are eligible in every related theme. For example,
  shrimp pasta can appear under both Seafood and Pasta & Noodles.
- Effort ranges and category notes are recommendation inputs, not only display
  labels.
- Exact household recipes, feedback, recent cooking, saved recipes, and the
  current week's plan still determine ranking within a theme.

## Replacement mapping

The 2026-08-25 production migration retained every category record and `catId`
so historical meal assignments remained valid. It broadened or clarified IDs
1–11. ID 12 changed from Pizza to Flexible Choice; existing pizza dishes moved
to Casual Favorites and also relate to Handheld & Oven Meals.
