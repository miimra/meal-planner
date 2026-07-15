# What's for Dinner? 🍽️

A calm, personal dinner planner built around a pre-decided **2-week rotation**, so you
never have to ask _"what should I cook tonight?"_ again.

Built as an installable **PWA** — Next.js 16 + Tailwind v4. Fully offline, no login,
data stored locally in the browser. Bilingual (English + Persian), light & dark mode.

> Made for one busy user: pick nothing daily, feel calm, and if a night gets skipped —
> no streaks, no guilt, nothing breaks.

---

## Features

- **Today** — the day's category shown as a big "Tonight" card (emoji, English + Persian
  name, effort badge, notes), followed by the dishes in it. Tap a dish to mark it cooked.
  Saturdays show _"Eating out"_; Sundays let you pick between kabab and a heavy stew.
  A small preview shows tomorrow.
- **Week** — the current Mon–Sun at a glance, today highlighted, weekends softened.
- **Rotation** — the full 2-week grid plus the rules, with the current week/day marked.
- **Dishes** — add / edit / delete your own dishes inside each of the 12 categories, with
  optional notes. "Reset" restores the original list.

---

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start   # production
```

### Install on your phone

Open the site in mobile Safari/Chrome → **Share → Add to Home Screen**. It launches
full-screen like a native app and works offline.

---

## How the rotation works

The plan is fixed in code (`app/lib/rotation.ts`):

|         | Mon                | Tue            | Wed          | Thu               | Fri             | Sat     | Sun          |
| ------- | ------------------ | -------------- | ------------ | ----------------- | --------------- | ------- | ------------ |
| **Week 1** | 🍗 Int'l Chicken/Meat | 🍳 Bandari & Eggs | 🐟 Fish & Shrimp | 🍚 Layered Rice/Dami | 🍝 Pasta & Noodles | 🍴 eat out | 🍢 / 🍲 pick |
| **Week 2** | 🍕 Pizza            | 🌡️ Cold & Simple | 🥗 Salad-as-Meal | 🥟 Pastry/Baked    | 🍔 Burgers & Sushi | 🍴 eat out | 🍢 / 🍲 pick |

Which half you're in is derived from the calendar (anchored to a known Monday), so it
advances automatically every two weeks. Tuesdays are always quick; Iranian and
international styles alternate across the week.

---

## Design

The **"Sage & Clay"** system: forest-green primary (nav, buttons, cooked state) with a
warm terracotta/clay accent (the "Tonight" eyebrow, week pill, effort badge), on a warm
parchment background. Full light & dark themes. Persian text renders right-to-left
throughout via the Vazirmatn typeface.

Design tokens live in `app/globals.css`. See [`DESIGN_BRIEF.md`](./DESIGN_BRIEF.md) for
the original brief.

---

## Data & storage

- `app/lib/categories.ts` — the 12 fixed categories + their default dishes.
- Dishes, cooked-marks, and Sunday choices live in **`localStorage`** (`mp_dishes_v1`,
  `mp_sunday_v1`), seeded from the defaults on first run. No backend, single user.

---

## Project structure

```
app/
  page.tsx          Today
  week/             Week view
  rotation/         2-week grid
  dishes/           Dish manager
  lib/              categories · rotation · store · dishName
  components/       BottomNav · badges
  manifest.ts       PWA manifest
  globals.css       design tokens (light + dark)
public/             app icons (svg + maskable)
```

---

## Tech

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 ·
Vazirmatn font. No runtime dependencies beyond the framework.

## Not built yet (post-MVP ideas)

Shopping-list generation, prep reminders/notifications, dish-history sorting, guest mode,
family preferences, a full FA/EN UI toggle. The local data layer is ready to build these
on top of.
