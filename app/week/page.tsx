"use client";

import { useEffect, useState } from "react";
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

export default function WeekPage() {
  const [mounted, setMounted] = useState(false);
  const [today] = useState(() => new Date());
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-96 animate-pulse rounded-3xl bg-bg-elevated" />;
  }

  const days = weekPlan(today);
  const monday = mondayOf(today);
  const todayIdx = toDayIndex(today);
  const todayKey = dateKey(today);

  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-bold">This week</h1>
        <p className="text-sm text-ink-faint">
          Week {days[0].week} of the rotation
        </p>
      </header>

      <ul className="flex flex-col gap-2.5">
        {days.map((plan) => {
          const date = addDays(monday, plan.day);
          const isToday = dateKey(date) === todayKey;
          const label = cellLabel(plan);
          const isWeekend = plan.day >= 5;

          return (
            <li
              key={plan.day}
              className="flex items-center gap-4 rounded-2xl p-3.5"
              style={{
                background: "var(--bg-elevated)",
                boxShadow: "var(--shadow)",
                border: isToday ? "2px solid var(--accent)" : "2px solid transparent",
                opacity: isWeekend ? 0.85 : 1,
              }}
            >
              <div className="flex w-12 flex-none flex-col items-center">
                <span className="text-xs font-medium text-ink-faint">
                  {plan.dayName.slice(0, 3)}
                </span>
                <span
                  className="text-lg font-bold"
                  style={{ color: isToday ? "var(--accent)" : "var(--ink)" }}
                >
                  {date.getDate()}
                </span>
              </div>

              <span className="text-3xl">{label.emoji}</span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{label.title}</p>
                {label.fa && (
                  <p className="fa truncate text-sm text-ink-soft">{label.fa}</p>
                )}
              </div>

              {isToday && (
                <span className="flex-none rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink">
                  Today
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
