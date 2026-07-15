# Design Brief — "What's for Dinner?" Meal Planner

A brief for designing the UI/UX of a personal dinner-planner app. This document is
self-contained: everything you need to produce a design is here. Deliver whatever your
format is (Figma-style mockups, HTML/CSS prototype, design tokens, component specs).

---

## 1. What the app is

A calm, personal app that tells one user **what to cook for dinner tonight**, based on a
pre-decided **2-week rotation** of dish *categories*. It removes the daily "what should I
cook?" decision.

It is **not** a recipe app, nutrition tracker, or delivery service. The user already
knows how to cook everything. The app's only job is to reduce mental load.

**One-line promise:** open it, know what to cook in under 5 seconds, feel calm.

---

## 2. Who it's for (the only user)

- **Maryam** — mother of a toddler (under 2), works part-time until 5 PM, lives in the
  Netherlands, Iranian. Bilingual: English + Persian (Farsi).
- Busy, tired after work, low patience for fiddly UI. Uses it on her **phone**, often
  one-handed, often in the kitchen.
- She wants predictability and gentleness, not productivity pressure.

---

## 3. Emotional target & design philosophy

The feeling should be **warm, calm, reassuring** — like a friend who already decided
dinner for you. Not clinical, not gamified, not "productivity app."

Hard rules that shape the design:

1. **Ask nothing of the user daily** — the plan is already decided; the default screen
   requires zero input.
2. **Fail gracefully** — if she doesn't cook one night, there is **no red X, no broken
   streak, no guilt**. Never design shame or pressure states.
3. **Respect energy levels** — the design should feel lighter/quieter on low-effort days.
4. **Family food, not fitness food** — cozy home life, not macros or discipline.
5. **Legibility over cleverness** — big tap targets, high contrast, glanceable.

---

## 4. Bilingual & RTL requirement (important)

Every dish and category has both an **English label** and a **Persian name**. Persian is
right-to-left script and must render correctly (RTL, proper Persian typography — e.g.
Vazirmatn or similar). The UI chrome is English/LTR; Persian appears as secondary
labels. Design must gracefully show an English title with a Persian subtitle, and mixed
strings like `بندری (eggs + sausage + potatoes)`.

Plan for a possible future **full Persian/English toggle** (not required now, but don't
design something that would break under RTL).

---

## 5. Platform & constraints

- **Mobile-first PWA**, installable to the home screen; launches full-screen. Design for
  a ~375–430px wide phone viewport first. A tablet/desktop centered layout is a plus.
- Must support **light and dark mode** (dark mode matters — kitchen at night).
- Persistent **bottom tab navigation** with 4 destinations (see screens below).
- Respect the iOS safe-area (notch / home indicator) at the bottom.
- Offline, single user, no login, no accounts, no social features.

---

## 6. Screens to design

There are **4 primary screens** reached via a bottom tab bar: **Today · Week · Rotation ·
Dishes**.

### 6.1 Today (home — the hero screen)
The most important screen. Must answer "what do I cook tonight?" instantly.
- Date + which rotation week it is (e.g. "Monday 13 July · Week 1").
- **Big focal category card**: large emoji, English name, Persian name, and an effort
  badge (e.g. "⚡ Quick · 20–30 min").
- Optional category note as a soft callout (e.g. "Pasta needs a side — don't serve carbs
  alone").
- A **list of dishes** in that category. Each is tappable to "mark as cooked today" —
  design the un-cooked and cooked states (cooked = a gentle, positive confirmation, NOT a
  checkbox chore). Consider a warm affirmation on cook ("Cooked today — nice one 🌿").
- A small **"Tomorrow: …"** preview at the bottom.

**Special day states to design:**
- **Saturday = "Eating out"**: no plan. A relaxed, permission-giving empty-ish card
  ("No plan tonight. Relax and enjoy.").
- **Sunday = user's choice**: present **two category options** (Iranian grilled vs. heavy
  stew) as a friendly pick-one; after picking, it behaves like a normal category card
  with a "change choice" affordance.

### 6.2 Week
- The current week Mon→Sun as a vertical list (or grid).
- Each day: day name + date, category emoji, English + Persian name.
- **Highlight today.** Dim/soften the weekend rows. Show which rotation week it is.

### 6.3 Rotation (the whole plan)
- The full **2-week rotation** shown as two labeled blocks (Week 1, Week 2), each with
  its 7 days. Mark the **current week** and **current day**.
- Include a small "the rules" section (short, friendly bullet list).

### 6.4 Dishes (manager)
- The 12 categories as an expandable/accordion list; each shows a count.
- Expanded: the dishes in that category, each with **edit** and **delete**; an **add a
  dish** input; optional per-dish notes. A quiet "reset to defaults" action.
- This is a utility screen — keep it clean and unfussy.

---

## 7. Content you're designing around (real data)

**The 12 fixed categories** (emoji · English · Persian · effort). These drive the visual
language — the emoji is each category's identity.

| # | Emoji | English | Persian | Effort | Notes |
|---|-------|---------|---------|--------|-------|
| 1 | 🍳 | Bandari & Eggs | بندری و تخم‌مرغی | Quick (20–30m) | |
| 2 | 🍢 | Iranian Grilled | کبابی ایرانی | Medium (30–45m) | weekend only |
| 3 | 🍲 | Heavy Iranian Stews | خورشت‌های سنگین | Heavy (60–120m) | weekend, prep-ahead |
| 4 | 🍚 | Layered Rice & Dami | لا پلو و دمی | Medium–Heavy (45–90m) | |
| 5 | 🍗 | International Chicken/Meat | مرغ/گوشت بین‌المللی | Medium (30–45m) | |
| 6 | 🐟 | Fish & Shrimp | ماهی و میگو | Medium (25–45m) | "Fish weekly at most" |
| 7 | 🍝 | Pasta & Noodles | پاستا و نودل | Quick (20–45m) | "needs a side" |
| 8 | 🍔 | Burgers & Sushi | همبرگر و سوشی | Medium (30–45m) | |
| 9 | 🥟 | Pastries & Baked | خمیری و تنوری | Medium (30–45m) | |
| 10 | 🥗 | Salad as Meal | سالاد به‌عنوان وعده | Quick (15–30m) | |
| 11 | 🌡️ | Cold & Simple | سرد و راحت | Quick (10–30m) | |
| 12 | 🍕 | Pizza | پیتزا | Medium (30–45m) | homemade or takeaway |

**Effort levels** (design distinct but calm badges): Quick ⚡, Medium 🕒, Medium–Heavy 🕓,
Heavy 🔥.

**The 2-week rotation** the screens visualize:

| | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|--|--|--|--|--|--|--|--|
| **Week 1** | 🍗 Int'l Chicken/Meat | 🍳 Bandari & Eggs | 🐟 Fish & Shrimp | 🍚 Layered Rice/Dami | 🍝 Pasta & Noodles | 🍴 eat out | 🍢/🍲 pick |
| **Week 2** | 🍕 Pizza | 🌡️ Cold & Simple | 🥗 Salad-as-Meal | 🥟 Pastry/Baked | 🍔 Burgers & Sushi | 🍴 eat out | 🍢/🍲 pick |

Notes for realism: Tuesday is always quick (baby is home). Iranian and international
alternate across the week.

---

## 8. Current visual direction (starting point — feel free to elevate)

A first implementation exists with this palette. Treat it as a **reference, not a
ceiling** — you're welcome to refine typography, spacing, color, and motion.

**Light**
- Background `#faf6f0` (warm cream), elevated surface `#ffffff`
- Ink `#2c2420`, soft `#6b5d54`, faint `#a89a8f`
- Accent (terracotta) `#c2611f`, accent-soft `#f4e6d8`, accent-ink `#8a3d0f`
- "Good"/positive green `#4b8a5a`, hairline `#ece3d8`

**Dark**
- Background `#1a1613`, surface `#241f1a`
- Ink `#f3ece3`, soft `#c3b5a8`, faint `#8a7c70`
- Accent `#e8823f`, accent-soft `#3a2a1c`, accent-ink `#f0a866`, green `#79b489`

**Type:** Vazirmatn (covers Latin + Persian well). Rounded, generous. Large friendly
titles, comfortable body.

**Shape & feel:** soft rounded cards (large radii ~24px), gentle shadows, roomy padding,
big emoji as the emotional anchor of each category. Warm, tactile, unhurried.

---

## 9. What we'd love from you (deliverables)

1. A refined **visual system**: color tokens (light + dark), type scale, spacing, radii,
   elevation, iconography approach, and the effort/state badges.
2. **High-fidelity mockups** of all 4 screens, including the special Today states
   (weekday, eating-out, Sunday-choice, cooked-confirmation) in **both light and dark**.
3. The **cooked / not-cooked** dish states and the **empty/relaxed** states, designed to
   feel encouraging, never punishing.
4. Bottom-nav design (4 tabs) and the app icon direction.
5. Notes on any micro-interactions/motion that reinforce calm (keep it subtle).

---

## 10. Success criteria (judge the design against these)

- User knows what to cook in **< 5 seconds** of opening.
- Zero required input on a normal day.
- Feels **calm and predictable**, never guilt-inducing.
- Glanceable and one-hand friendly on a phone, day or night (light/dark).
- Persian text looks correct and cared-for, not an afterthought.

> Design principle to keep front-of-mind: **reduce cognitive load, don't add to it.**
> Simplicity beats features every time here.
