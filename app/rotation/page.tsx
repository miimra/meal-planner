"use client";

import { useEffect, useState } from "react";
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
  return (
    <section
      className="rounded-3xl bg-bg-elevated p-4"
      style={{ boxShadow: "var(--shadow)" }}
    >
      <div className="mb-3 flex items-center gap-2 px-1">
        <h2 className="text-lg font-bold">Week {week}</h2>
        {isCurrentWeek && (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-ink">
            Current
          </span>
        )}
      </div>

      <ul className="flex flex-col">
        {DAY_NAMES.map((name, i) => {
          const plan = planForDay(week, i as DayIndex);
          const label = planLabel(plan, categories);
          const isToday = isCurrentWeek && currentDay === i;
          return (
            <li
              key={i}
              className="flex items-center gap-3 rounded-xl px-2 py-2"
              style={{ background: isToday ? "var(--accent-soft)" : "transparent" }}
            >
              <span className="w-10 flex-none text-xs font-medium text-ink-faint">
                {name.slice(0, 3)}
              </span>
              <span className="text-2xl">{label.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{label.title}</p>
                {label.fa && (
                  <p className="fa truncate text-xs text-ink-soft">{label.fa}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function RotationPage() {
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

  const currentWeek = rotationWeekOf(today);
  const currentDay = toDayIndex(today);

  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-bold">2-week rotation</h1>
        <p className="text-sm text-ink-faint">
          The whole plan at a glance. It repeats every two weeks.
        </p>
      </header>

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

      <section className="rounded-2xl border border-line p-4 text-sm text-ink-soft">
        <h3 className="mb-2 font-semibold text-ink">The rules</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>Tuesday is always quick — baby is home.</li>
          <li>Iranian and international alternate across the week.</li>
          <li>Saturday you eat out. Sunday is kabab or a heavy stew — your call.</li>
          <li>Miss a night? No problem. Nothing to keep up, nothing to break.</li>
        </ul>
      </section>
    </main>
  );
}
