# PocketBase-backed content + login-gated editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move categories + dishes from hardcoded/localStorage into PocketBase, keep the app publicly readable, and gate all editing behind a single login.

**Architecture:** One Docker container runs the PocketBase binary, which serves both its REST API and the Next.js static export (`output: "export"`) from `pb_public/`. The frontend talks to PocketBase same-origin via the official `pocketbase` JS SDK. `categories`/`dishes` collections are public-read, login-required-write; the one login account is PocketBase's built-in `users` auth collection, created manually via the Admin UI. `rotation.ts`'s day→category-id schedule and the per-device `lastCooked`/Sunday-choice state stay exactly as they are today (in code / in `localStorage`).

**Tech Stack:** Next.js 16 (App Router, static export), React 19, TypeScript, PocketBase (server binary + `pocketbase` JS SDK), Node's built-in `node:test` runner (no new test framework).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-07-pocketbase-auth-design.md` — read it before starting, this plan implements it exactly.
- No roles — every check is just "logged in or not" (`@request.auth.id != ''` server-side, `useAuth().isLoggedIn` client-side).
- The 12 `categories` records are fixed (`createRule`/`deleteRule` disabled) — only their fields are editable. `rotation.ts` keeps referencing them by the stable `catId` (1–12), never PocketBase's own record id.
- `lastCooked` marks and the Sunday kabab/stew choice stay in `localStorage`, unchanged — not part of this migration.
- No realtime subscriptions, no cross-tab sync — plain fetch-then-refetch-after-mutation. (`ponytail:` noted inline where this trade-off is made.)
- No new test framework — use Node's built-in `node:test` (`node --test`, works directly on `.test.ts` files on Node ≥22 with `--experimental-strip-types`, no config needed on Node ≥24). Only pure logic gets an automated test; UI is verified manually (matches this codebase's existing lack of UI tests).
- PocketBase server version pinned in the Dockerfile: **v0.39.10**.
- **Known regression, flagged not hidden:** the Dishes page's "Reset to defaults" button is dropped in this plan. It relied on redoing client-side what's now a one-time server-side seed (`pb_migrations`). If you want it back, say so — cheapest fix is a small authenticated endpoint or just re-running the migration against a fresh `pb_data`.

---

## Task 1: PocketBase JS SDK + test runner script

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `pocketbase` npm package available to import (`import PocketBase from "pocketbase"`); `npm test` runs `node --test`.

- [ ] **Step 1: Install the SDK**

Run: `npm install pocketbase`

Expected: `package.json` gains a `"pocketbase": "^0.2x.x"` entry under `"dependencies"`, `package-lock.json` updates.

- [ ] **Step 2: Add the test script**

In `package.json`, add a `"test"` entry to `"scripts"`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "node --experimental-strip-types --test"
  }
}
```

- [ ] **Step 3: Verify the test runner works with no tests yet**

Run: `npm test`
Expected: `ℹ tests 0` (passes trivially — no `*.test.ts` files exist yet, that's fine).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add pocketbase SDK and node:test script"
```

---

## Task 2: PocketBase client singleton

**Files:**
- Create: `app/lib/pb.ts`

**Interfaces:**
- Produces: `pb` — a shared `PocketBase` client instance, imported by every data/auth hook.

- [ ] **Step 1: Write the client**

```ts
// app/lib/pb.ts
import PocketBase from "pocketbase";

// Same-origin in production (PocketBase serves the app itself — see
// Dockerfile). NEXT_PUBLIC_PB_URL overrides this for local `next dev`,
// where the frontend and PocketBase run as separate processes.
const baseUrl =
  process.env.NEXT_PUBLIC_PB_URL ??
  (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8090");

export const pb = new PocketBase(baseUrl);
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `app/lib/pb.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/lib/pb.ts
git commit -m "Add shared PocketBase client"
```

---

## Task 3: PocketBase schema + seed migration

**Files:**
- Create: `pb_migrations/1754524800_categories_and_dishes.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: two PocketBase collections once this migration has run against a `pb_data`:
  - `categories` — fields `catId, name_en, name_fa, emoji, style, effort, effort_min, effort_max, weekend_only, prep_ahead, notes`. `listRule`/`viewRule` public, `updateRule` logged-in-only, `createRule`/`deleteRule` disabled.
  - `dishes` — fields `catId, name, notes`. `listRule`/`viewRule` public, `createRule`/`updateRule`/`deleteRule` logged-in-only.
  - Seeded with the 12 categories and 43 dishes currently hardcoded in `app/lib/categories.ts`.

- [ ] **Step 1: Ignore local PocketBase data**

In `.gitignore`, add:

```
# pocketbase (local dev)
/pb_data/
/pocketbase
```

- [ ] **Step 2: Write the migration**

```js
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
```

- [ ] **Step 3: Download PocketBase locally and run the migration**

```bash
curl -Lo /tmp/pb.zip https://github.com/pocketbase/pocketbase/releases/download/v0.39.10/pocketbase_0.39.10_linux_amd64.zip
unzip -o /tmp/pb.zip pocketbase -d /tmp/pb
/tmp/pb/pocketbase serve --http=127.0.0.1:8090
```

(Adjust the asset filename if not on linux/amd64 — see `https://github.com/pocketbase/pocketbase/releases/tag/v0.39.10`.) Leave this running in a background terminal for the next step and for later manual verification tasks.

- [ ] **Step 4: Verify the migration created and seeded both collections**

In a second terminal:

```bash
curl -s "http://127.0.0.1:8090/api/collections/categories/records?perPage=50" | grep -o '"catId":[0-9]*' | wc -l
curl -s "http://127.0.0.1:8090/api/collections/dishes/records?perPage=100" | grep -o '"id":"[a-z0-9]*"' | wc -l
```

Expected: first command prints `12`, second prints `44` (43 dishes + 1 due to the outer records-list `"id"` field also matching — if it prints something other than 43/44, use `curl -s ... | python3 -c "import sys,json;print(json.load(sys.stdin)['totalItems'])"` instead and expect `43`).

- [ ] **Step 5: Verify write access is actually gated**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://127.0.0.1:8090/api/collections/dishes/records" \
  -H "Content-Type: application/json" -d '{"catId":1,"name":"test"}'
```

Expected: `400` (rejected — no auth). This confirms `createRule` is enforced before any frontend code exists to rely on it.

- [ ] **Step 6: Commit**

```bash
git add pb_migrations/1754524800_categories_and_dishes.js .gitignore
git commit -m "Add PocketBase schema + seed migration for categories and dishes"
```

---

## Task 4: Auth wrapper + login control

**Files:**
- Create: `app/lib/auth.ts`
- Create: `app/components/LoginControl.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `pb` from `app/lib/pb.ts` (Task 2).
- Produces: `useAuth(): { isLoggedIn: boolean; login(email, password): Promise<void>; logout(): void }`, used by Task 11's Dishes page gating.

- [ ] **Step 1: Write the auth hook**

```ts
// app/lib/auth.ts
"use client";

import { useCallback, useSyncExternalStore } from "react";
import { pb } from "./pb";

function subscribe(callback: () => void) {
  return pb.authStore.onChange(callback);
}

function getSnapshot() {
  return pb.authStore.isValid;
}

function getServerSnapshot() {
  return false;
}

export function useAuth() {
  const isLoggedIn = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const login = useCallback(async (email: string, password: string) => {
    await pb.collection("users").authWithPassword(email, password);
  }, []);

  const logout = useCallback(() => {
    pb.authStore.clear();
  }, []);

  return { isLoggedIn, login, logout };
}
```

- [ ] **Step 2: Write the login control component**

```tsx
// app/components/LoginControl.tsx
"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth";

export default function LoginControl() {
  const { isLoggedIn, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isLoggedIn) {
    return (
      <button
        onClick={() => {
          if (confirm("Log out?")) logout();
        }}
        aria-label="Log out"
        className="fixed right-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full text-lg"
        style={{ background: "var(--bg-elevated)", boxShadow: "var(--shadow-sm)" }}
      >
        🔓
      </button>
    );
  }

  return (
    <div className="fixed right-3 top-3 z-30">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Log in"
        className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
        style={{ background: "var(--bg-elevated)", boxShadow: "var(--shadow-sm)" }}
      >
        🔒
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            setError(null);
            try {
              await login(email, password);
              setOpen(false);
              setPassword("");
            } catch {
              setError("Wrong email or password.");
            } finally {
              setSubmitting(false);
            }
          }}
          className="absolute right-0 mt-2 flex w-56 flex-col gap-2 rounded-2xl p-3"
          style={{ background: "var(--bg-elevated)", boxShadow: "var(--shadow)" }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire it into the root layout**

In `app/layout.tsx`, add the import and render it as a sibling of `<BottomNav />`:

```ts
import BottomNav from "./components/BottomNav";
import LoginControl from "./components/LoginControl";
```

```tsx
      <body className={`${vazirmatn.variable} antialiased`}>
        <div className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-6">{children}</div>
        <LoginControl />
        <BottomNav />
      </body>
```

- [ ] **Step 4: Manual verification**

With the Task 3 PocketBase still running at `127.0.0.1:8090`, create your one account via its Admin UI at `http://127.0.0.1:8090/_/` (Settings → the default `users` collection → New record, or the initial superuser setup flow — either way, note the email/password). Then:

```bash
NEXT_PUBLIC_PB_URL=http://127.0.0.1:8090 npm run dev
```

Open `http://localhost:3000`, click the 🔒 icon top-right, log in with that account. Expected: icon switches to 🔓; clicking it and confirming logs back out (icon returns to 🔒). Wrong password shows the inline error without a page reload.

- [ ] **Step 5: Commit**

```bash
git add app/lib/auth.ts app/components/LoginControl.tsx app/layout.tsx
git commit -m "Add login/logout via PocketBase auth"
```

---

## Task 5: Decouple rotation.ts from category data

**Files:**
- Modify: `app/lib/rotation.ts`
- Create: `app/lib/rotation.test.ts`

**Interfaces:**
- Consumes: `Category`, `findCategory` from `app/lib/categories.ts` (Task 6 trims this file — `findCategory` is added there in that task; write both this task and Task 6 together if doing them out of order isn't practical, see note below).
- Produces: `PlanDay.categoryId?: number`, `PlanDay.choiceIds?: number[]` (replaces the old `category`/`choices` fields that held full `Category` objects), `planLabel(plan, categories): { emoji, title, fa? }`.

> **Note:** This task's code calls `findCategory`, which Task 6 adds to `categories.ts`. Do Task 6 first if executing strictly in order, or do both together — they touch different files and don't conflict.

- [ ] **Step 1: Replace `PlanDay` and `planForDay`, add `planLabel`**

Full new contents of `app/lib/rotation.ts`:

```ts
import { Category, findCategory } from "./categories";

// ── Day model ────────────────────────────────────────────────────────────────
// We work in Monday-first order to match the rotation tables in the README.

export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday … 6 = Sunday
export type RotationWeek = 1 | 2;

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Convert a JS Date (getDay: 0=Sun..6=Sat) into our Monday-first index. */
export function toDayIndex(date: Date): DayIndex {
  return ((date.getDay() + 6) % 7) as DayIndex;
}

/** Local YYYY-MM-DD key (avoids UTC off-by-one from toISOString). */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The Monday (00:00 local) of the week containing `date`. */
export function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - toDayIndex(d));
  return d;
}

// Jan 1 2024 was a Monday — a stable anchor for week-parity.
const ANCHOR = new Date(2024, 0, 1);
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Which half of the 2-week rotation the given date falls in. */
export function rotationWeekOf(date: Date): RotationWeek {
  const weeks = Math.round((mondayOf(date).getTime() - ANCHOR.getTime()) / MS_PER_WEEK);
  return ((((weeks % 2) + 2) % 2) === 0 ? 1 : 2) as RotationWeek;
}

// ── The plan ─────────────────────────────────────────────────────────────────
// Category id for each weekday, per rotation week. `null` = special handling
// (weekend). See README "The 2-Week Rotation". This table only knows catIds —
// it has no dependency on where/how category content is loaded.

const WEEK_1: (number | null)[] = [5, 1, 6, 4, 7, null, null];
const WEEK_2: (number | null)[] = [12, 11, 10, 9, 8, null, null];

export type DayKind = "weekday" | "eat-out" | "sunday-choice";

export interface PlanDay {
  day: DayIndex;
  dayName: string;
  week: RotationWeek;
  kind: DayKind;
  /** Resolved category id for weekdays. Undefined for weekends. */
  categoryId?: number;
  /** Sunday offers a choice between these two category ids. */
  choiceIds?: number[];
}

/** Resolve the plan for a specific weekday index within a rotation week. */
export function planForDay(week: RotationWeek, day: DayIndex): PlanDay {
  const dayName = DAY_NAMES[day];

  if (day === 5) {
    return { day, dayName, week, kind: "eat-out" };
  }
  if (day === 6) {
    return { day, dayName, week, kind: "sunday-choice", choiceIds: [2, 3] };
  }

  const table = week === 1 ? WEEK_1 : WEEK_2;
  const catId = table[day]!;
  return { day, dayName, week, kind: "weekday", categoryId: catId };
}

/** The plan for an actual calendar date. */
export function planForDate(date: Date): PlanDay {
  return planForDay(rotationWeekOf(date), toDayIndex(date));
}

/** The seven PlanDays (Mon→Sun) for the week containing `date`. */
export function weekPlan(date: Date): PlanDay[] {
  const week = rotationWeekOf(date);
  return DAY_NAMES.map((_, i) => planForDay(week, i as DayIndex));
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

/** Human label for effort + minute range, e.g. "20–30 min". */
export function effortRange(category: Category): string {
  const [a, b] = category.effort_minutes;
  return `${a}–${b} min`;
}

// ── Display labels ───────────────────────────────────────────────────────────

export interface PlanLabel {
  emoji: string;
  title: string;
  fa?: string;
}

/** Resolve a PlanDay into what to show, given the currently-loaded categories. */
export function planLabel(plan: PlanDay, categories: Category[]): PlanLabel {
  if (plan.kind === "eat-out") return { emoji: "🍴", title: "Eating out" };
  if (plan.kind === "sunday-choice") {
    return { emoji: "🍢", title: "Your pick", fa: "کبابی یا خورشت" };
  }
  const category =
    plan.categoryId !== undefined ? findCategory(categories, plan.categoryId) : undefined;
  return {
    emoji: category?.emoji ?? "❓",
    title: category?.name_en ?? "Unknown",
    fa: category?.name_fa,
  };
}
```

- [ ] **Step 2: Write the test**

```ts
// app/lib/rotation.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { planForDay, planLabel, rotationWeekOf } from "./rotation";
import { Category } from "./categories";

const fixtureCategories: Category[] = [
  {
    pbId: "abc123",
    catId: 5,
    name_en: "International Chicken/Meat",
    name_fa: "مرغ/گوشت بین‌المللی",
    emoji: "🍗",
    style: "international",
    effort: "medium",
    effort_minutes: [30, 45],
  },
];

test("planForDay returns a categoryId for a weekday", () => {
  const plan = planForDay(1, 0); // Monday, week 1
  assert.equal(plan.kind, "weekday");
  assert.equal(plan.categoryId, 5);
});

test("planForDay marks Saturday as eat-out", () => {
  const plan = planForDay(1, 5);
  assert.equal(plan.kind, "eat-out");
  assert.equal(plan.categoryId, undefined);
});

test("planForDay offers two choices on Sunday", () => {
  const plan = planForDay(1, 6);
  assert.equal(plan.kind, "sunday-choice");
  assert.deepEqual(plan.choiceIds, [2, 3]);
});

test("planLabel resolves a weekday plan against known categories", () => {
  const plan = planForDay(1, 0);
  const label = planLabel(plan, fixtureCategories);
  assert.equal(label.title, "International Chicken/Meat");
  assert.equal(label.emoji, "🍗");
  assert.equal(label.fa, "مرغ/گوشت بین‌المللی");
});

test("planLabel falls back gracefully when categories haven't loaded yet", () => {
  const plan = planForDay(1, 0);
  const label = planLabel(plan, []);
  assert.equal(label.title, "Unknown");
});

test("rotationWeekOf alternates every 2 weeks from the Jan 1 2024 anchor", () => {
  assert.equal(rotationWeekOf(new Date(2024, 0, 1)), 1);
  assert.equal(rotationWeekOf(new Date(2024, 0, 8)), 2);
  assert.equal(rotationWeekOf(new Date(2024, 0, 15)), 1);
});
```

- [ ] **Step 3: Run the test — expect it to fail (categories.ts doesn't export `findCategory`/the new `Category` shape yet if Task 6 hasn't run)**

Run: `npm test`
Expected: FAIL (type error or missing export) if Task 6 isn't done yet — that's expected; proceed to Task 6, then re-run.

- [ ] **Step 4: After Task 6 is done, run again and verify it passes**

Run: `npm test`
Expected: all `rotation.test.ts` cases PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/rotation.ts app/lib/rotation.test.ts
git commit -m "Decouple rotation schedule from category data, add planLabel"
```

---

## Task 6: Trim categories.ts to types + labels

**Files:**
- Modify: `app/lib/categories.ts`

**Interfaces:**
- Produces: `Category` (now includes `pbId: string`, `catId: number`; no longer has `dishes: string[]`), `Style`, `Effort`, `EFFORT_LABEL`, `STYLE_LABEL`, `findCategory(categories, catId)`. Removes `CATEGORIES`, `CATEGORY_BY_ID`, `getCategory`.

- [ ] **Step 1: Replace the file contents**

```ts
// app/lib/categories.ts
// The 12 fixed categories. Their content lives in PocketBase (see the
// `categories` collection in pb_migrations/) so it's server-editable while
// logged in; this file only keeps the shared TypeScript shape and the
// static UI labels.

export type Style = "iranian" | "international" | "either";
export type Effort = "quick" | "medium" | "medium-heavy" | "heavy";

export interface Category {
  /** PocketBase record id — needed to call update(). */
  pbId: string;
  /** Stable 1–12 id. `rotation.ts`'s day tables reference categories by this. */
  catId: number;
  name_fa: string;
  name_en: string;
  emoji: string;
  style: Style;
  effort: Effort;
  effort_minutes: [number, number];
  weekend_only?: boolean;
  prep_ahead?: boolean;
  notes?: string;
}

export function findCategory(categories: Category[], catId: number): Category | undefined {
  return categories.find((c) => c.catId === catId);
}

export const EFFORT_LABEL: Record<Effort, string> = {
  quick: "Quick",
  medium: "Medium",
  "medium-heavy": "Medium–Heavy",
  heavy: "Heavy",
};

export const STYLE_LABEL: Record<Style, string> = {
  iranian: "Iranian",
  international: "International",
  either: "Either",
};
```

- [ ] **Step 2: Verify the rotation tests pass now**

Run: `npm test`
Expected: `rotation.test.ts` cases from Task 5 PASS.

- [ ] **Step 3: Commit**

```bash
git add app/lib/categories.ts
git commit -m "Trim categories.ts to shared types + labels, drop hardcoded content"
```

---

## Task 7: Rewrite store.ts as PocketBase-backed hooks

**Files:**
- Modify: `app/lib/store.ts`
- Create: `app/lib/store.test.ts`

**Interfaces:**
- Consumes: `pb` (Task 2), `Category`/`Style`/`Effort` (Task 6).
- Produces:
  - `useCategories(): { categories: Category[], loading: boolean, error: string | null, update(pbId, patch): Promise<void> }`
  - `useDishes(): { dishes: Dish[], loading: boolean, error: string | null, forCategory(categoryId): Dish[], add(categoryId, name, notes?): Promise<void>, update(id, patch): Promise<void>, remove(id): Promise<void>, markCooked(id, dateKey): void }`
  - `mapCategoryRecord`, `mapDishRecord` — pure, exported for testing.
  - `Dish { id, categoryId, name, notes?, lastCooked? }`

- [ ] **Step 1: Replace the file contents**

```ts
// app/lib/store.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { pb } from "./pb";
import { Category, Effort, Style } from "./categories";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Dish {
  id: string; // PocketBase record id
  categoryId: number; // matches Category.catId
  name: string;
  notes?: string;
  lastCooked?: string; // YYYY-MM-DD, kept locally (see readLastCooked below)
}

interface CategoryRecord {
  id: string;
  catId: number;
  name_en: string;
  name_fa: string;
  emoji: string;
  style: Style;
  effort: Effort;
  effort_min: number;
  effort_max: number;
  weekend_only?: boolean;
  prep_ahead?: boolean;
  notes?: string;
}

interface DishRecord {
  id: string;
  catId: number;
  name: string;
  notes?: string;
}

// ── PocketBase record → app-shape mapping (pure — see store.test.ts) ─────────

export function mapCategoryRecord(r: CategoryRecord): Category {
  return {
    pbId: r.id,
    catId: r.catId,
    name_en: r.name_en,
    name_fa: r.name_fa,
    emoji: r.emoji,
    style: r.style,
    effort: r.effort,
    effort_minutes: [r.effort_min, r.effort_max],
    weekend_only: r.weekend_only || undefined,
    prep_ahead: r.prep_ahead || undefined,
    notes: r.notes || undefined,
  };
}

export function mapDishRecord(r: DishRecord, lastCookedMap: Record<string, string>): Dish {
  return {
    id: r.id,
    categoryId: r.catId,
    name: r.name,
    notes: r.notes || undefined,
    lastCooked: lastCookedMap[r.id],
  };
}

// ── "Cooked today" — per-device only, never sent to PocketBase ───────────────
// ponytail: plain localStorage map, no server sync. Add a PocketBase field if
// tracking cook history across devices ever matters.

const LAST_COOKED_KEY = "mp_last_cooked_v1";

function readLastCooked(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LAST_COOKED_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeLastCooked(map: Record<string, string>) {
  window.localStorage.setItem(LAST_COOKED_KEY, JSON.stringify(map));
}

// ── Categories ───────────────────────────────────────────────────────────────

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const records = await pb
        .collection("categories")
        .getFullList<CategoryRecord>({ sort: "catId" });
      setCategories(records.map(mapCategoryRecord));
      setError(null);
    } catch {
      setError("Couldn't load categories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const update = useCallback(
    async (pbId: string, patch: Partial<Omit<Category, "pbId" | "catId">>) => {
      const { effort_minutes, ...rest } = patch;
      const body: Record<string, unknown> = { ...rest };
      if (effort_minutes) {
        body.effort_min = effort_minutes[0];
        body.effort_max = effort_minutes[1];
      }
      await pb.collection("categories").update(pbId, body);
      await refresh();
    },
    [refresh]
  );

  return { categories, loading, error, update };
}

// ── Dishes ───────────────────────────────────────────────────────────────────

export function useDishes() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const records = await pb.collection("dishes").getFullList<DishRecord>({ sort: "name" });
      const lastCookedMap = readLastCooked();
      setDishes(records.map((r) => mapDishRecord(r, lastCookedMap)));
      setError(null);
    } catch {
      setError("Couldn't load dishes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const forCategory = useCallback(
    (categoryId: number) => dishes.filter((d) => d.categoryId === categoryId),
    [dishes]
  );

  const add = useCallback(
    async (categoryId: number, name: string, notes?: string) => {
      await pb.collection("dishes").create({
        catId: categoryId,
        name: name.trim(),
        notes: notes?.trim() || undefined,
      });
      await refresh();
    },
    [refresh]
  );

  const update = useCallback(
    async (id: string, patch: { name?: string; notes?: string }) => {
      await pb.collection("dishes").update(id, patch);
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      await pb.collection("dishes").delete(id);
      await refresh();
    },
    [refresh]
  );

  const markCooked = useCallback((id: string, key: string) => {
    const map = readLastCooked();
    if (map[id] === key) {
      delete map[id];
    } else {
      map[id] = key;
    }
    writeLastCooked(map);
    setDishes((prev) => prev.map((d) => (d.id === id ? { ...d, lastCooked: map[id] } : d)));
  }, []);

  return { dishes, loading, error, forCategory, add, update, remove, markCooked };
}
```

- [ ] **Step 2: Write the test**

```ts
// app/lib/store.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCategoryRecord, mapDishRecord } from "./store";

test("mapCategoryRecord converts a PocketBase record into a Category", () => {
  const category = mapCategoryRecord({
    id: "pbid1",
    catId: 5,
    name_en: "International Chicken/Meat",
    name_fa: "مرغ/گوشت بین‌المللی",
    emoji: "🍗",
    style: "international",
    effort: "medium",
    effort_min: 30,
    effort_max: 45,
  });
  assert.equal(category.pbId, "pbid1");
  assert.equal(category.catId, 5);
  assert.deepEqual(category.effort_minutes, [30, 45]);
  assert.equal(category.weekend_only, undefined);
});

test("mapCategoryRecord keeps weekend_only/notes when set", () => {
  const category = mapCategoryRecord({
    id: "pbid2",
    catId: 2,
    name_en: "Iranian Grilled",
    name_fa: "کبابی ایرانی",
    emoji: "🍢",
    style: "iranian",
    effort: "medium",
    effort_min: 30,
    effort_max: 45,
    weekend_only: true,
    notes: "weekend only",
  });
  assert.equal(category.weekend_only, true);
  assert.equal(category.notes, "weekend only");
});

test("mapDishRecord attaches lastCooked from the local map by dish id", () => {
  const dish = mapDishRecord(
    { id: "d1", catId: 5, name: "Butter Chicken" },
    { d1: "2026-08-07" }
  );
  assert.equal(dish.categoryId, 5);
  assert.equal(dish.lastCooked, "2026-08-07");
});

test("mapDishRecord leaves lastCooked undefined when not in the local map", () => {
  const dish = mapDishRecord({ id: "d2", catId: 5, name: "Teriyaki" }, {});
  assert.equal(dish.lastCooked, undefined);
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: all `store.test.ts` cases PASS (plus the earlier `rotation.test.ts` cases still passing).

- [ ] **Step 4: Commit**

```bash
git add app/lib/store.ts app/lib/store.test.ts
git commit -m "Rewrite store.ts as PocketBase-backed useCategories/useDishes"
```

---

## Task 8: Wire the Today page to PocketBase

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `useCategories`, `useDishes` (Task 7); `findCategory`, `Category` (Task 6); `planLabel`, `PlanDay` (Task 5).

- [ ] **Step 1: Update imports**

Replace:

```ts
import { Category } from "./lib/categories";
import { addDays, dateKey, planForDate, PlanDay } from "./lib/rotation";
import { Dish, useDishes } from "./lib/store";
```

with:

```ts
import { Category, findCategory } from "./lib/categories";
import { addDays, dateKey, planForDate, planLabel, PlanDay } from "./lib/rotation";
import { Dish, useCategories, useDishes } from "./lib/store";
```

- [ ] **Step 2: Load categories and gate on their loading state too**

Replace:

```ts
  const [mounted, setMounted] = useState(false);
  const [today] = useState(() => new Date());
  const { forCategory, markCooked } = useDishes();
```

with:

```ts
  const [mounted, setMounted] = useState(false);
  const [today] = useState(() => new Date());
  const { categories, loading: categoriesLoading } = useCategories();
  const { forCategory, markCooked } = useDishes();
```

Replace:

```ts
  if (!mounted) {
    return <div className="h-64 animate-pulse rounded-3xl bg-bg-elevated" />;
  }
```

with:

```ts
  if (!mounted || categoriesLoading) {
    return <div className="h-64 animate-pulse rounded-3xl bg-bg-elevated" />;
  }
```

- [ ] **Step 3: Resolve categories by id instead of reading `plan.category`/`plan.choices`**

Replace:

```ts
  const chosen =
    plan.kind === "sunday-choice" && sunday !== null
      ? plan.choices!.find((c) => c.id === sunday)
      : plan.category;
```

with:

```ts
  const choices = plan.choiceIds?.map((id) => findCategory(categories, id)).filter(
    (c): c is Category => c !== undefined
  );
  const chosen =
    plan.kind === "sunday-choice" && sunday !== null
      ? choices?.find((c) => c.catId === sunday)
      : findCategory(categories, plan.categoryId!);
```

- [ ] **Step 4: Update the JSX that references `plan.choices` and `chosen.id`**

Replace:

```tsx
      {plan.kind === "sunday-choice" && sunday === null && (
        <SundayChooser
          choices={plan.choices!}
          onPick={(id) => {
```

with:

```tsx
      {plan.kind === "sunday-choice" && sunday === null && (
        <SundayChooser
          choices={choices!}
          onPick={(id) => {
```

Replace:

```tsx
          <DishList
            dishes={forCategory(chosen.id)}
```

with:

```tsx
          <DishList
            dishes={forCategory(chosen.catId)}
```

- [ ] **Step 5: Update `SundayChooser` to key/pick by `catId`**

Replace:

```tsx
        {choices.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
```

with:

```tsx
        {choices.map((c) => (
          <button
            key={c.catId}
            onClick={() => onPick(c.catId)}
```

- [ ] **Step 6: Update `TomorrowPreview` to use `planLabel` instead of `plan.category`**

Replace:

```tsx
function TomorrowPreview({ plan }: { plan: PlanDay }) {
  const label =
    plan.kind === "eat-out"
      ? "🍴 Eating out"
      : plan.kind === "sunday-choice"
        ? "🍢 Your pick"
        : `${plan.category!.emoji} ${plan.category!.name_en}`;

  return (
    <Link
      href="/week"
      className="flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-sm"
    >
      <span className="text-ink-faint">Tomorrow · {plan.dayName}</span>
      <span className="font-semibold">{label}</span>
    </Link>
  );
}
```

with:

```tsx
function TomorrowPreview({ plan, categories }: { plan: PlanDay; categories: Category[] }) {
  const { emoji, title } = planLabel(plan, categories);

  return (
    <Link
      href="/week"
      className="flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-sm"
    >
      <span className="text-ink-faint">Tomorrow · {plan.dayName}</span>
      <span className="font-semibold">
        {emoji} {title}
      </span>
    </Link>
  );
}
```

And update its call site:

```tsx
      <TomorrowPreview plan={tomorrowPlan} />
```

becomes:

```tsx
      <TomorrowPreview plan={tomorrowPlan} categories={categories} />
```

- [ ] **Step 7: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors in `app/page.tsx`.

- [ ] **Step 8: Manual verification**

With PocketBase still running (`NEXT_PUBLIC_PB_URL=http://127.0.0.1:8090 npm run dev`), open `http://localhost:3000`. Expected: today's category card renders with the real emoji/name/dishes from PocketBase, "Tomorrow: …" preview shows correctly, and (if today is Sunday) the two-choice picker works.

- [ ] **Step 9: Commit**

```bash
git add app/page.tsx
git commit -m "Wire Today page to PocketBase-backed categories/dishes"
```

---

## Task 9: Wire the Week page

**Files:**
- Modify: `app/week/page.tsx`

**Interfaces:**
- Consumes: `useCategories` (Task 7), `planLabel` (Task 5).

- [ ] **Step 1: Replace the local `cellLabel` with the shared `planLabel`**

Replace:

```ts
import {
  addDays,
  dateKey,
  mondayOf,
  PlanDay,
  toDayIndex,
  weekPlan,
} from "../lib/rotation";

function cellLabel(plan: PlanDay): { emoji: string; title: string; fa?: string } {
  if (plan.kind === "eat-out") return { emoji: "🍴", title: "Eating out" };
  if (plan.kind === "sunday-choice")
    return { emoji: "🍢", title: "Your pick", fa: "کبابی یا خورشت" };
  return {
    emoji: plan.category!.emoji,
    title: plan.category!.name_en,
    fa: plan.category!.name_fa,
  };
}
```

with:

```ts
import {
  addDays,
  dateKey,
  mondayOf,
  planLabel,
  toDayIndex,
  weekPlan,
} from "../lib/rotation";
import { useCategories } from "../lib/store";
```

- [ ] **Step 2: Load categories and gate on loading**

Replace:

```ts
export default function WeekPage() {
  const [mounted, setMounted] = useState(false);
  const [today] = useState(() => new Date());
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-96 animate-pulse rounded-3xl bg-bg-elevated" />;
  }
```

with:

```ts
export default function WeekPage() {
  const [mounted, setMounted] = useState(false);
  const [today] = useState(() => new Date());
  const { categories, loading: categoriesLoading } = useCategories();
  useEffect(() => setMounted(true), []);

  if (!mounted || categoriesLoading) {
    return <div className="h-96 animate-pulse rounded-3xl bg-bg-elevated" />;
  }
```

- [ ] **Step 3: Use `planLabel(plan, categories)` instead of `cellLabel(plan)`**

Replace:

```ts
          const label = cellLabel(plan);
```

with:

```ts
          const label = planLabel(plan, categories);
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors in `app/week/page.tsx`.

- [ ] **Step 5: Manual verification**

Open `http://localhost:3000/week`. Expected: all 7 days show correct emoji/English/Persian names, today is highlighted.

- [ ] **Step 6: Commit**

```bash
git add app/week/page.tsx
git commit -m "Wire Week page to PocketBase-backed categories"
```

---

## Task 10: Wire the Rotation page

**Files:**
- Modify: `app/rotation/page.tsx`

**Interfaces:**
- Consumes: `useCategories` (Task 7), `planLabel` (Task 5).

- [ ] **Step 1: Replace the local `rowLabel` with `planLabel`, thread `categories` through `WeekBlock`**

Replace:

```ts
import {
  DAY_NAMES,
  DayIndex,
  planForDay,
  PlanDay,
  RotationWeek,
  rotationWeekOf,
  toDayIndex,
} from "../lib/rotation";

function rowLabel(plan: PlanDay): { emoji: string; en: string; fa?: string } {
  if (plan.kind === "eat-out") return { emoji: "🍴", en: "Eating out" };
  if (plan.kind === "sunday-choice")
    return { emoji: "🍢", en: "Kabab or stew (your pick)", fa: "کبابی یا خورشت" };
  return {
    emoji: plan.category!.emoji,
    en: plan.category!.name_en,
    fa: plan.category!.name_fa,
  };
}

function WeekBlock({
  week,
  currentDay,
  isCurrentWeek,
}: {
  week: RotationWeek;
  currentDay: DayIndex | null;
  isCurrentWeek: boolean;
}) {
```

with:

```ts
import {
  DAY_NAMES,
  DayIndex,
  planForDay,
  planLabel,
  RotationWeek,
  rotationWeekOf,
  toDayIndex,
} from "../lib/rotation";
import { Category } from "../lib/categories";
import { useCategories } from "../lib/store";

function WeekBlock({
  week,
  currentDay,
  isCurrentWeek,
  categories,
}: {
  week: RotationWeek;
  currentDay: DayIndex | null;
  isCurrentWeek: boolean;
  categories: Category[];
}) {
```

- [ ] **Step 2: Use `planLabel` inside the row-rendering loop**

Replace:

```ts
        {DAY_NAMES.map((name, i) => {
          const plan = planForDay(week, i as DayIndex);
          const label = rowLabel(plan);
```

with:

```ts
        {DAY_NAMES.map((name, i) => {
          const plan = planForDay(week, i as DayIndex);
          const label = planLabel(plan, categories);
```

Note `planLabel`'s return shape is `{ emoji, title, fa? }` — update the two JSX references below from `label.en` to `label.title`:

```tsx
                <p className="truncate text-sm font-medium">{label.en}</p>
```

becomes:

```tsx
                <p className="truncate text-sm font-medium">{label.title}</p>
```

- [ ] **Step 3: Load categories in the page component and pass them down**

Replace:

```ts
export default function RotationPage() {
  const [mounted, setMounted] = useState(false);
  const [today] = useState(() => new Date());
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-96 animate-pulse rounded-3xl bg-bg-elevated" />;
  }
```

with:

```ts
export default function RotationPage() {
  const [mounted, setMounted] = useState(false);
  const [today] = useState(() => new Date());
  const { categories, loading: categoriesLoading } = useCategories();
  useEffect(() => setMounted(true), []);

  if (!mounted || categoriesLoading) {
    return <div className="h-96 animate-pulse rounded-3xl bg-bg-elevated" />;
  }
```

Replace:

```tsx
      <WeekBlock
        week={1}
        currentDay={currentWeek === 1 ? currentDay : null}
        isCurrentWeek={currentWeek === 1}
      />
      <WeekBlock
        week={2}
        currentDay={currentWeek === 2 ? currentDay : null}
        isCurrentWeek={currentWeek === 2}
      />
```

with:

```tsx
      <WeekBlock
        week={1}
        currentDay={currentWeek === 1 ? currentDay : null}
        isCurrentWeek={currentWeek === 1}
        categories={categories}
      />
      <WeekBlock
        week={2}
        currentDay={currentWeek === 2 ? currentDay : null}
        isCurrentWeek={currentWeek === 2}
        categories={categories}
      />
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors in `app/rotation/page.tsx`.

- [ ] **Step 5: Manual verification**

Open `http://localhost:3000/rotation`. Expected: both week blocks render all 14 rows with correct emoji/names, current week/day still highlighted.

- [ ] **Step 6: Commit**

```bash
git add app/rotation/page.tsx
git commit -m "Wire Rotation page to PocketBase-backed categories"
```

---

## Task 11: Wire the Dishes page — login-gated editing + category fields

**Files:**
- Modify: `app/dishes/page.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 4), `useCategories`, `useDishes` (Task 7), `Category`/`Style`/`Effort`/`EFFORT_LABEL`/`STYLE_LABEL` (Task 6).

- [ ] **Step 1: Replace the whole file**

```tsx
// app/dishes/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { Category, EFFORT_LABEL, Effort, STYLE_LABEL, Style } from "../lib/categories";
import { Dish, useCategories, useDishes } from "../lib/store";

function isPersian(s: string) {
  return /[؀-ۿ]/.test(s.trim().charAt(0));
}

export default function DishesPage() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const { isLoggedIn } = useAuth();
  const { categories, loading: categoriesLoading, update: updateCategory } = useCategories();
  const dishStore = useDishes();
  useEffect(() => setMounted(true), []);

  if (!mounted || categoriesLoading) {
    return <div className="h-96 animate-pulse rounded-3xl bg-bg-elevated" />;
  }

  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-bold">Your dishes</h1>
        <p className="text-sm text-ink-faint">
          {isLoggedIn ? "Tap a category to edit its dishes" : "Tap a category to see its dishes"}
        </p>
      </header>

      <div className="flex flex-col gap-2.5">
        {categories.map((cat) => {
          const dishes = dishStore.forCategory(cat.catId);
          const isOpen = open === cat.catId;
          return (
            <section
              key={cat.catId}
              className="overflow-hidden rounded-2xl bg-bg-elevated"
              style={{ boxShadow: "var(--shadow)" }}
            >
              <button
                onClick={() => setOpen(isOpen ? null : cat.catId)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span className="text-2xl">{cat.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{cat.name_en}</p>
                    {cat.weekend_only && (
                      <span className="flex-none text-xs text-ink-faint">weekend</span>
                    )}
                  </div>
                  <p className="fa truncate text-sm text-ink-soft">{cat.name_fa}</p>
                </div>
                <span className="flex-none text-sm text-ink-faint">{dishes.length}</span>
                <span
                  className="flex-none text-ink-faint transition-transform"
                  style={{ transform: isOpen ? "rotate(90deg)" : "none" }}
                >
                  ›
                </span>
              </button>

              {isOpen && (
                <CategoryEditor
                  category={cat}
                  dishes={dishes}
                  dishStore={dishStore}
                  isLoggedIn={isLoggedIn}
                  onUpdateCategory={updateCategory}
                />
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}

function CategoryEditor({
  category,
  dishes,
  dishStore,
  isLoggedIn,
  onUpdateCategory,
}: {
  category: Category;
  dishes: Dish[];
  dishStore: ReturnType<typeof useDishes>;
  isLoggedIn: boolean;
  onUpdateCategory: (
    pbId: string,
    patch: Partial<Omit<Category, "pbId" | "catId">>
  ) => Promise<void>;
}) {
  const [adding, setAdding] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState(false);

  return (
    <div className="border-t border-line px-4 pb-4 pt-2">
      {isLoggedIn && (
        <div className="flex justify-end pb-2">
          <button
            onClick={() => setEditingCategory((v) => !v)}
            className="text-xs text-accent underline underline-offset-2"
          >
            {editingCategory ? "Done" : "Edit category"}
          </button>
        </div>
      )}

      {editingCategory && (
        <CategoryFieldsEditor
          category={category}
          onUpdate={onUpdateCategory}
          onSave={() => setEditingCategory(false)}
        />
      )}

      {dishes.length === 0 && (
        <p className="py-2 text-sm text-ink-faint">
          {isLoggedIn ? "No dishes yet — add one below." : "No dishes yet."}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-line">
        {dishes.map((dish) =>
          editingId === dish.id ? (
            <DishEdit
              key={dish.id}
              dish={dish}
              onSave={(name, notes) => {
                dishStore.update(dish.id, { name, notes: notes || undefined });
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <li key={dish.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${isPersian(dish.name) ? "fa" : ""}`}>{dish.name}</p>
                {dish.notes && <p className="truncate text-xs text-ink-faint">{dish.notes}</p>}
                {dish.lastCooked && (
                  <p className="text-xs text-ink-faint">Last cooked {dish.lastCooked}</p>
                )}
              </div>
              {isLoggedIn && (
                <>
                  <button
                    onClick={() => setEditingId(dish.id)}
                    className="flex-none rounded-lg px-2 py-1 text-xs text-accent"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${dish.name}"?`)) dishStore.remove(dish.id);
                    }}
                    className="flex-none rounded-lg px-2 py-1 text-xs text-ink-faint"
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          )
        )}
      </ul>

      {isLoggedIn && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (adding.trim()) {
              dishStore.add(category.catId, adding);
              setAdding("");
            }
          }}
          className="mt-3 flex gap-2"
        >
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            placeholder="Add a dish…"
            className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!adding.trim()}
            className="flex-none rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Add
          </button>
        </form>
      )}
    </div>
  );
}

const STYLE_OPTIONS: Style[] = ["iranian", "international", "either"];
const EFFORT_OPTIONS: Effort[] = ["quick", "medium", "medium-heavy", "heavy"];

function CategoryFieldsEditor({
  category,
  onUpdate,
  onSave,
}: {
  category: Category;
  onUpdate: (
    pbId: string,
    patch: Partial<Omit<Category, "pbId" | "catId">>
  ) => Promise<void>;
  onSave: () => void;
}) {
  const [nameEn, setNameEn] = useState(category.name_en);
  const [nameFa, setNameFa] = useState(category.name_fa);
  const [emoji, setEmoji] = useState(category.emoji);
  const [style, setStyle] = useState<Style>(category.style);
  const [effort, setEffort] = useState<Effort>(category.effort);
  const [effortMin, setEffortMin] = useState(String(category.effort_minutes[0]));
  const [effortMax, setEffortMax] = useState(String(category.effort_minutes[1]));
  const [weekendOnly, setWeekendOnly] = useState(!!category.weekend_only);
  const [prepAhead, setPrepAhead] = useState(!!category.prep_ahead);
  const [notes, setNotes] = useState(category.notes ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onUpdate(category.pbId, {
          name_en: nameEn.trim(),
          name_fa: nameFa.trim(),
          emoji: emoji.trim(),
          style,
          effort,
          effort_minutes: [Number(effortMin) || 0, Number(effortMax) || 0],
          weekend_only: weekendOnly,
          prep_ahead: prepAhead,
          notes: notes.trim() || undefined,
        });
        setSaving(false);
        onSave();
      }}
      className="mb-3 flex flex-col gap-2 rounded-xl border border-line p-3"
    >
      <div className="flex gap-2">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          className="w-16 rounded-xl border border-line bg-bg px-3 py-2 text-center text-lg outline-none focus:border-accent"
          placeholder="🍽️"
        />
        <input
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="English name"
        />
      </div>
      <input
        value={nameFa}
        onChange={(e) => setNameFa(e.target.value)}
        className="fa rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        placeholder="Persian name"
      />
      <div className="flex gap-2">
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value as Style)}
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {STYLE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STYLE_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={effort}
          onChange={(e) => setEffort(e.target.value as Effort)}
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {EFFORT_OPTIONS.map((ef) => (
            <option key={ef} value={ef}>
              {EFFORT_LABEL[ef]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={effortMin}
          onChange={(e) => setEffortMin(e.target.value)}
          className="w-20 rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <span className="text-sm text-ink-faint">–</span>
        <input
          type="number"
          value={effortMax}
          onChange={(e) => setEffortMax(e.target.value)}
          className="w-20 rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <span className="text-sm text-ink-faint">min</span>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={weekendOnly}
          onChange={(e) => setWeekendOnly(e.target.checked)}
        />
        Weekend only
      </label>
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={prepAhead}
          onChange={(e) => setPrepAhead(e.target.checked)}
        />
        Prep ahead
      </label>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        placeholder="Notes (optional)"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save category"}
      </button>
    </form>
  );
}

function DishEdit({
  dish,
  onSave,
  onCancel,
}: {
  dish: Dish;
  onSave: (name: string, notes: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(dish.name);
  const [notes, setNotes] = useState(dish.notes ?? "");

  return (
    <li className="flex flex-col gap-2 py-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent ${
          isPersian(name) ? "fa" : ""
        }`}
        placeholder="Dish name"
      />
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        placeholder="Notes (optional)"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-ink-faint">
          Cancel
        </button>
        <button
          onClick={() => name.trim() && onSave(name.trim(), notes.trim())}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
        >
          Save
        </button>
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors in `app/dishes/page.tsx`.

- [ ] **Step 3: Manual verification — logged out**

Open `http://localhost:3000/dishes` while logged out (🔒 showing). Expected: categories and their dishes list, but no "Edit category" link, no per-dish Edit/Delete buttons, no add-a-dish form.

- [ ] **Step 4: Manual verification — logged in**

Log in via the 🔒 control, revisit `/dishes`. Expected: "Edit category" link appears; clicking it shows the full field form pre-filled with current values; changing e.g. the notes and saving persists (reload the page to confirm — refetches from PocketBase). Per-dish Edit/Delete and the add-a-dish form all work and persist across reloads.

- [ ] **Step 5: Commit**

```bash
git add app/dishes/page.tsx
git commit -m "Gate dish/category editing behind login on the Dishes page"
```

---

## Task 12: Static export + single-container Dockerfile

**Files:**
- Modify: `next.config.ts`
- Modify: `Dockerfile`

**Interfaces:** None (build/deploy only).

- [ ] **Step 1: Switch to static export**

Full new contents of `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
```

- [ ] **Step 2: Verify the static build works**

Run: `npm run build`
Expected: build succeeds, and an `out/` directory appears containing `index.html`, `week/index.html`, `rotation/index.html`, `dishes/index.html`, plus `_next/` assets. No errors about unsupported dynamic features (there are none in this app).

- [ ] **Step 3: Replace the Dockerfile**

```dockerfile
# Stage 1: build the static Next.js export
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: PocketBase serves the static export + the API — one process, one port
FROM alpine:3.20
ARG PB_VERSION=0.39.10
RUN apk add --no-cache ca-certificates unzip curl \
  && curl -Lo /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
  && unzip /tmp/pb.zip pocketbase -d /pb \
  && rm /tmp/pb.zip \
  && apk del unzip curl

WORKDIR /pb
COPY --from=builder /app/out ./pb_public
COPY pb_migrations ./pb_migrations

EXPOSE 8090
VOLUME /pb/pb_data
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
```

- [ ] **Step 4: Build and run the image**

```bash
docker build -t meal-planner .
docker run --rm -p 8090:8090 -v meal-planner-pb-data:/pb/pb_data meal-planner
```

- [ ] **Step 5: Verify the single container serves both the app and the API**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8090/
curl -s "http://localhost:8090/api/collections/categories/records?perPage=1" -o /dev/null -w "%{http_code}\n"
```

Expected: both print `200`. Then open `http://localhost:8090/` in a browser — the app loads and shows real data. Create your login account at `http://localhost:8090/_/` if you haven't already (this container's `pb_data` volume is fresh), confirm login/edit still works end-to-end against the containerized instance.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts Dockerfile
git commit -m "Switch to static export served by PocketBase in a single container"
```

---

## Task 13: README updates

**Files:**
- Modify: `README.md`

**Interfaces:** None (documentation only).

- [ ] **Step 1: Update the "Run it" section**

Replace:

```md
## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start   # production
```
```

with:

```md
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
```

- [ ] **Step 2: Update the "Data & storage" section**

Replace:

```md
## Data & storage

- `app/lib/categories.ts` — the 12 fixed categories + their default dishes.
- Dishes, cooked-marks, and Sunday choices live in **`localStorage`** (`mp_dishes_v1`,
  `mp_sunday_v1`), seeded from the defaults on first run. No backend, single user.
```

with:

```md
## Data & storage

- Categories and dishes live in **PocketBase** (`pb_migrations/` seeds the 12
  categories + their default dishes on first boot). Publicly readable;
  editing (dishes, category fields) requires being logged in — see the 🔒/🔓
  control top-right. No roles, one account.
- Cooked-marks and the Sunday choice stay in **`localStorage`**
  (`mp_last_cooked_v1`, `mp_sunday_v1`) — per-device, not shared, not synced.
```

- [ ] **Step 3: Update "Project structure" and "Tech" sections**

Replace:

```md
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
```

with:

```md
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
```

Replace:

```md
## Tech

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 ·
Vazirmatn font. No runtime dependencies beyond the framework.
```

with:

```md
## Tech

Next.js 16 (App Router, static export) · React 19 · TypeScript · Tailwind CSS
v4 · Vazirmatn font · PocketBase (server + JS SDK) for data and auth.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Update README for PocketBase-backed data and login"
```

---

## Self-Review Notes

- **Spec coverage:** single container (Task 12) ✓, categories+dishes in PocketBase (Tasks 3, 7) ✓, public read / login-gated write (Task 3 rules, Task 11 UI gating) ✓, one manually-created login account (Task 4 step 4, spec Non-goals) ✓, `lastCooked`/Sunday choice stay local (Task 7, untouched Sunday-choice code in `app/page.tsx`) ✓, re-seed from current defaults (Task 3) ✓.
- **Placeholder scan:** none — every step has real, complete code or an exact command with expected output.
- **Type consistency:** `Category.catId`/`pbId` (Task 6) used consistently in `rotation.ts` (Task 5), `store.ts` (Task 7), and all four pages (Tasks 8–11). `PlanDay.categoryId`/`choiceIds` (Task 5) used consistently wherever `PlanDay` is read. `planLabel`'s `{ emoji, title, fa? }` shape used consistently in Tasks 8–10.
- **Known gap carried forward from the spec:** no realtime/cross-tab sync, exact PocketBase JS SDK version left to `npm install` to resolve (both called out in Global Constraints).
