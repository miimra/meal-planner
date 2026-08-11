"use client";

import { useMemo, useState } from "react";
import {
  MEALS,
  addDateDays,
  amsterdamToday,
  buildDay,
  dayLabel,
  mondayKey,
  type MealSlot,
} from "../lib/plan.ts";
import { useMealPlan } from "../lib/useMealPlan.ts";

const ICON = { breakfast: "☀️", lunch: "🥪", dinner: "🌙" } as const;
const EMPTY = { unplanned: "Waiting", skipped: "Skipped", buy_food: "Buy food", eating_out: "Eat out", planned: "Planned", cooked: "Cooked" } as const;

export default function WeekPage() {
  const [today] = useState(() => amsterdamToday());
  const start = mondayKey(today);
  const end = addDateDays(start, 6);
  const { assignments, categories, dishes, error, loading, refresh } = useMealPlan(start, end);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => buildDay(addDateDays(start, index), categories, dishes, assignments)),
    [assignments, categories, dishes, start],
  );

  if (loading) return <div className="h-[70dvh] animate-pulse rounded-[36px] bg-bg-elevated" />;
  if (error) return <button onClick={refresh} className="rounded-3xl bg-bg-elevated p-6 font-bold text-accent">{error} Tap to retry.</button>;

  return (
    <main className="flex flex-col gap-6 pb-4">
      <header className="pt-2">
        <p className="text-sm font-extrabold uppercase tracking-[0.24em] text-accent">Monday to Sunday</p>
        <h1 className="font-display mt-2 text-4xl font-bold tracking-tight">The week</h1>
        <p className="mt-2 text-sm font-medium text-ink-soft">{start} → {end}</p>
      </header>

      <div className="flex flex-col gap-4">
        {days.map((day) => (
          <article
            key={day.date}
            className="overflow-hidden rounded-[30px] border p-4 sm:p-5"
            style={{
              background: day.date === today ? "linear-gradient(145deg, var(--hero-from), var(--hero-via), var(--hero-to))" : "var(--bg-elevated)",
              borderColor: day.date === today ? "var(--accent)" : "var(--line)",
              boxShadow: day.date === today ? "var(--shadow)" : "var(--shadow-sm)",
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-bold">{dayLabel(day.date, "short")}</h2>
                <p className="text-xs font-semibold text-ink-faint">{day.date}</p>
              </div>
              {day.date === today && <span className="rounded-full bg-accent px-3 py-1 text-xs font-extrabold text-white">Today</span>}
            </div>
            <div className="grid gap-2.5">
              {MEALS.map((meal) => <WeekMeal key={meal} slot={day.meals[meal]} />)}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

function WeekMeal({ slot }: { slot: MealSlot }) {
  const name = slot.dish?.name || EMPTY[slot.status];
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-bg/55 px-3 py-3">
      <span className="text-xl">{ICON[slot.meal]}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{name}</p>
        <p className="truncate text-xs font-medium text-ink-faint">
          {slot.category ? `${slot.category.emoji} ${slot.category.name_en}` : slot.meal}
        </p>
      </div>
    </div>
  );
}
