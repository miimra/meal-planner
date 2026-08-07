# What's for Dinner? 🍽️

A calm, personal dinner planner built around a pre-decided **2-week rotation**, so you
never have to ask _"what should I cook tonight?"_ again.

Built as an installable **PWA** — Next.js 16 + Tailwind v4, backed by **PocketBase**.
The plan is public and read-only for anyone; log in to edit dishes and categories.
Bilingual (English + Persian), light & dark mode.

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
  optional notes.

---

## Run it

Needs a running PocketBase for data — see below.

```bash
npm install

# Local dev: point the frontend at a separately-running PocketBase
curl -Lo /tmp/pb.zip https://github.com/pocketbase/pocketbase/releases/download/v0.39.10/pocketbase_0.39.10_linux_amd64.zip
unzip -o /tmp/pb.zip pocketbase -d /tmp/pb
/tmp/pb/pocketbase serve --http=127.0.0.1:8090 &
NEXT_PUBLIC_PB_URL=http://127.0.0.1:8090 npm run dev      # http://localhost:3000
```

### Production (single container)

```bash
docker build -t meal-planner .
docker run -p 8090:8090 -v meal-planner-pb-data:/pb/pb_data meal-planner
```

PocketBase serves both the app and its API from `http://localhost:8090`. On
first run, create your one login account at `http://localhost:8090/_/`
(PocketBase's Admin UI) — there's no in-app signup.

### Install on your phone

Open the site in mobile Safari/Chrome → **Share → Add to Home Screen**. It launches
full-screen like a native app. Categories and dishes load from PocketBase, so it
needs a network connection; only the cooked-marks and Sunday choice work offline.

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

- Categories and dishes live in **PocketBase** (`pb_migrations/` seeds the 12
  categories + their default dishes on first boot). Publicly readable;
  editing (dishes, category fields) requires being logged in — see the 🔒/🔓
  control in the bottom nav. No roles, one account.
- Cooked-marks and the Sunday choice stay in **`localStorage`**
  (`mp_last_cooked_v1`, `mp_sunday_v1`) — per-device, not shared, not synced.

---

## Project structure

```
app/
  page.tsx          Today
  week/             Week view
  rotation/         2-week grid
  dishes/           Dish manager (login-gated editing)
  lib/              categories · rotation · store (PocketBase) · auth · pb · dishName
  components/       BottomNav · LoginControl · badges
  manifest.ts       PWA manifest
  globals.css       design tokens (light + dark)
public/             app icons (svg + maskable)
pb_migrations/      PocketBase schema + seed data
```

---

## Tech

Next.js 16 (App Router, static export) · React 19 · TypeScript · Tailwind CSS
v4 · Vazirmatn font · PocketBase (server + JS SDK) for data and auth.

## Not built yet (post-MVP ideas)

Shopping-list generation, prep reminders/notifications, dish-history sorting, guest mode,
family preferences, a full FA/EN UI toggle. The PocketBase data layer is ready to build
these on top of.
