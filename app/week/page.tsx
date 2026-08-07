"use client";

import { useEffect, useState } from "react";
import {
  addDays,
  dateKey,
  mondayOf,
  planLabel,
  toDayIndex,
  weekPlan,
} from "../lib/rotation";
import { useCategories } from "../lib/store";

export default function WeekPage() {
  const [mounted, setMounted] = useState(false);
  const [today] = useState(() => new Date());
  const { categories, loading: categoriesLoading, error: categoriesError } = useCategories();
  useEffect(() => setMounted(true), []);

  if (!mounted || categoriesLoading) {
    return <div className="h-96 animate-pulse rounded-3xl bg-bg-elevated" />;
  }

  if (categoriesError) {
    return <p className="text-sm text-ink-faint">Couldn't load — check your connection.</p>;
  }

  const days = weekPlan(today);
  const monday = mondayOf(today);
  const todayIdx = toDayIndex(today);
  const todayKey = dateKey(today);

  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-2xl font-bold">🗓️ This week</h1>
        <p className="text-sm text-ink-faint">
          Week {days[0].week} of the rotation
        </p>
      </header>

      <ul className="flex flex-col gap-2.5">
        {days.map((plan) => {
          const date = addDays(monday, plan.day);
          const isToday = dateKey(date) === todayKey;
          const label = planLabel(plan, categories);
          const isWeekend = plan.day >= 5;

          return (
            <li
              key={plan.day}
              className="flex items-center gap-4 rounded-[22px] p-3.5"
              style={{
                background: isToday
                  ? "linear-gradient(150deg, var(--hero-from), var(--hero-via) 60%, var(--hero-to))"
                  : "var(--bg-elevated)",
                boxShadow: "var(--shadow)",
                border: isToday ? "2px solid var(--accent)" : "2px solid transparent",
                opacity: isWeekend ? 0.9 : 1,
              }}
            >
              <div className="flex w-12 flex-none flex-col items-center">
                <span className="text-xs font-semibold text-ink-faint">
                  {plan.dayName.slice(0, 3)}
                </span>
                <span
                  className="font-display text-xl font-bold"
                  style={{ color: isToday ? "var(--accent)" : "var(--ink)" }}
                >
                  {date.getDate()}
                </span>
              </div>

              <span className={`text-3xl ${isToday ? "animate-bob" : ""}`}>
                {label.emoji}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{label.title}</p>
                {label.fa && (
                  <p className="fa truncate text-sm text-ink-soft">{label.fa}</p>
                )}
              </div>

              {isToday && (
                <span className="flex-none rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-white">
                  ✨ Today
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
