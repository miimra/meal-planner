"use client";

import { useMemo } from "react";
import {
  MEALS,
  addDateDays,
  amsterdamToday,
  buildDay,
  dayLabel,
  mealHasPassed,
  type MealSlot,
  type PlanDay,
} from "./lib/plan.ts";
import { useMealPlan } from "./lib/useMealPlan.ts";
import { useCurrentTime } from "./lib/useCurrentTime.ts";

const MEAL_META = {
  breakfast: { icon: "☀️", label: "Breakfast", tint: "#fff5cc" },
  lunch: { icon: "🥪", label: "Lunch", tint: "#e2f7ed" },
  dinner: { icon: "🌙", label: "Dinner", tint: "#eee7ff" },
} as const;

const SPECIAL = {
  unplanned: { icon: "✨", title: "Waiting for a suggestion", detail: "The bot will plan this meal." },
  skipped: { icon: "⏭️", title: "Skipped", detail: "No meal is planned." },
  buy_food: { icon: "🛒", title: "Buy food", detail: "Something easy from outside." },
  eating_out: { icon: "🍽️", title: "Eating out", detail: "No cooking needed." },
  planned: { icon: "✨", title: "Planned", detail: "" },
  cooked: { icon: "✅", title: "Cooked", detail: "" },
} as const;

export default function HomePage() {
  const now = useCurrentTime();
  const today = amsterdamToday(now);
  const tomorrow = addDateDays(today, 1);
  const { assignments, categories, dishes, error, loading, refresh } = useMealPlan(today, tomorrow);
  const days = useMemo(
    () => [buildDay(today, categories, dishes, assignments), buildDay(tomorrow, categories, dishes, assignments)],
    [assignments, categories, dishes, today, tomorrow],
  );

  if (loading) return <LoadingHome />;
  if (error) {
    return (
      <main className="flex min-h-[70dvh] items-center justify-center">
        <button className="rounded-3xl bg-bg-elevated px-6 py-5 font-bold text-accent shadow-lg" onClick={refresh}>
          {error} Tap to retry.
        </button>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-10 pb-4">
      <header className="pt-2">
        <p className="text-sm font-extrabold uppercase tracking-[0.24em] text-accent">Family table</p>
        <h1 className="font-display mt-2 text-4xl font-bold leading-none tracking-tight sm:text-5xl">
          Today & tomorrow
        </h1>
        <p className="mt-3 max-w-sm text-base text-ink-soft">The whole plan, without the noise.</p>
      </header>

      <DaySection day={days[0]} title="Today" now={now} featured />
      <DaySection day={days[1]} title="Tomorrow" now={now} />
    </main>
  );
}

function DaySection({ day, title, now, featured = false }: { day: PlanDay; title: string; now: Date; featured?: boolean }) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4 px-1">
        <div>
          <p className="font-display text-3xl font-bold">{title}</p>
          <p className="mt-0.5 text-sm font-medium text-ink-faint">{dayLabel(day.date)}</p>
        </div>
        {featured && <span className="rounded-full bg-accent-soft px-3 py-1.5 text-xs font-extrabold text-accent-ink">Right now</span>}
      </div>
      <div className="grid gap-4">
        {MEALS.map((meal) => (
          <MealCard key={meal} date={day.date} slot={day.meals[meal]} now={now} featured={featured && meal === "dinner"} />
        ))}
      </div>
    </section>
  );
}

function MealCard({ date, slot, now, featured }: { date: string; slot: MealSlot; now: Date; featured: boolean }) {
  const meta = MEAL_META[slot.meal];
  const special = SPECIAL[slot.status];
  const expired = !slot.dish && slot.status === "unplanned" && mealHasPassed(date, slot.meal, now);
  const title = slot.dish?.name || (expired ? "No plan selected" : special.title);
  const detail = slot.dish
    ? slot.status === "cooked" ? "Made today" : slot.selectionSource === "last_meal" ? "A recent favourite" : "Your exact meal plan"
    : expired ? "The decision time for this meal has passed." : special.detail;

  return (
    <article
      className={`relative overflow-hidden rounded-[32px] border p-5 ${featured ? "sm:p-7" : "sm:p-6"}`}
      style={{
        background: featured
          ? "linear-gradient(145deg, var(--hero-from), var(--hero-via) 55%, var(--hero-to))"
          : "var(--bg-elevated)",
        borderColor: featured ? "var(--accent)" : "var(--line)",
        boxShadow: featured ? "var(--shadow)" : "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl text-3xl" style={{ background: meta.tint }}>
          {slot.dish ? meta.icon : special.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-ink-faint">{meta.label}</p>
            {slot.category && (
              <span className="rounded-full bg-clay-soft px-3 py-1.5 text-xs font-extrabold text-clay-ink">
                Main category · {slot.category.emoji} {slot.category.name_en}
              </span>
            )}
          </div>
          <h2 className={`font-display mt-2 font-bold leading-tight tracking-tight ${featured ? "text-3xl" : "text-2xl"}`}>
            {title}
          </h2>
          <p className="mt-1.5 text-sm font-medium text-ink-soft">{detail}</p>
        </div>
      </div>
      {slot.category?.name_fa && <p className="fa mt-4 text-right text-sm text-ink-faint">{slot.category.name_fa}</p>}
    </article>
  );
}

function LoadingHome() {
  return (
    <main className="flex flex-col gap-8 pt-2">
      <div className="h-24 animate-pulse rounded-3xl bg-bg-elevated" />
      {[0, 1].map((section) => (
        <section key={section} className="space-y-4">
          <div className="h-12 w-44 animate-pulse rounded-2xl bg-bg-elevated" />
          {[0, 1, 2].map((card) => <div key={card} className="h-36 animate-pulse rounded-[32px] bg-bg-elevated" />)}
        </section>
      ))}
    </main>
  );
}
