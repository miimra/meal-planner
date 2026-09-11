"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import {
  MEALS,
  addDateDays,
  amsterdamToday,
  buildDay,
  dateFromKey,
  dayLabel,
  mealHasPassed,
  mondayKey,
  type MealSlot,
  type PlanDay,
} from "../lib/plan.ts";
import { DAY_SHORT, rotationWeekOf, toDayIndex } from "../lib/rotation.ts";
import { useMealPlan } from "../lib/useMealPlan.ts";
import { useCurrentTime } from "../lib/useCurrentTime.ts";

const MEAL_META = {
  breakfast: { icon: "☀️", label: "Breakfast" },
  lunch: { icon: "🥪", label: "Lunch" },
  dinner: { icon: "🌙", label: "Dinner" },
} as const;

const STATUS = {
  unplanned: "Not decided yet",
  planned: "Planned",
  cooked: "Cooked",
  skipped: "Skipped",
  leftovers: "Leftovers",
  buy_food: "Buy something",
  eating_out: "Eating out",
} as const;

const step = (index: number) => ({ "--i": index }) as CSSProperties;

export default function WeekPage() {
  const now = useCurrentTime();
  const today = amsterdamToday(now);
  const start = mondayKey(today);
  const end = addDateDays(start, 6);
  const { assignments, categories, dishes, error, loading, refresh } = useMealPlan(start, end);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        buildDay(addDateDays(start, index), categories, dishes, assignments),
      ),
    [assignments, categories, dishes, start],
  );

  if (loading) {
    return (
      <main className="flex flex-col gap-6 pt-2" aria-busy>
        <div className="shimmer h-28 rounded-[28px] border border-line bg-surface/60" />
        <div className="shimmer h-24 rounded-[28px] border border-line bg-surface/60" />
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="shimmer h-40 rounded-[30px] border border-line bg-surface/60" />
        ))}
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-[70dvh] items-center justify-center">
        <button
          onClick={refresh}
          className="press rise rounded-[28px] border border-line bg-surface px-7 py-6 text-center font-bold text-saffron-ink shadow-[var(--shadow-sm)]"
        >
          <span className="block text-3xl">🫙</span>
          <span className="mt-2 block">{error}</span>
          <span className="tick mt-2 block text-ink-faint">Tap to try again</span>
        </button>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-7 pb-6">
      <header className="pt-1">
        <p className="tick rise text-lapis" style={step(0)}>
          Rotation week {rotationWeekOf(dateFromKey(today))}
        </p>
        <h1 className="font-display rise mt-3 text-[2.75rem] leading-[0.95]" style={step(1)}>
          The week
        </h1>
        <p className="tabular rise mt-2 text-base text-ink-soft" style={step(2)}>
          {dayLabel(start, "short")} → {dayLabel(end, "short")}
        </p>
      </header>

      <WeekStrip days={days} today={today} />

      <div className="flex flex-col gap-3">
        {days.map((day, index) => (
          <DayCard key={day.date} day={day} today={today} now={now} index={index} />
        ))}
      </div>
    </main>
  );
}

/** Seven columns of dinner emoji — the whole week in one glance. */
function WeekStrip({ days, today }: { days: PlanDay[]; today: string }) {
  return (
    <section
      className="rise grid grid-cols-7 gap-1 rounded-[28px] border border-line bg-surface/60 px-2 py-3 backdrop-blur-sm"
      style={step(3)}
      aria-label="The week at a glance"
    >
      {days.map((day, index) => {
        const dinner = day.meals.dinner;
        const current = day.date === today;
        return (
          <div
            key={day.date}
            className="pop flex flex-col items-center gap-1 rounded-2xl py-2"
            style={{
              animationDelay: `${0.35 + index * 0.07}s`,
              background: current ? "var(--saffron-soft)" : "transparent",
            }}
          >
            <span className={`tick text-[0.5625rem] ${current ? "text-saffron-ink" : "text-ink-faint"}`}>
              {DAY_SHORT[toDayIndex(dateFromKey(day.date))]}
            </span>
            <span className={`text-xl ${current ? "bob" : ""}`}>
              {dinner.category?.emoji ?? (dinner.status === "eating_out" ? "🍽️" : "✳️")}
            </span>
          </div>
        );
      })}
    </section>
  );
}

function DayCard({
  day,
  today,
  now,
  index,
}: {
  day: PlanDay;
  today: string;
  now: Date;
  index: number;
}) {
  const current = day.date === today;
  const past = day.date < today;
  const weekend = toDayIndex(dateFromKey(day.date)) >= 5;

  const body = (
    <div className={`relative rounded-[28px] px-4 py-4 ${current ? "" : "border border-line bg-surface/80 shadow-[var(--shadow-sm)] backdrop-blur-sm"}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="h-2.5 w-2.5 flex-none rounded-full border-2"
            style={{
              borderColor: current ? "var(--saffron)" : "var(--line)",
              background: current ? "var(--saffron)" : "transparent",
            }}
            aria-hidden
          />
          <div>
            <h2 className="font-display text-lg leading-tight">{dayLabel(day.date, "short")}</h2>
            <p className="tabular text-xs font-semibold text-ink-faint">{day.date}</p>
          </div>
        </div>
        {current && (
          <span className="rounded-full bg-saffron px-3 py-1 text-[0.6875rem] font-extrabold uppercase tracking-widest text-surface">
            Today
          </span>
        )}
        {!current && weekend && <span className="tick text-ink-faint">Weekend</span>}
      </div>
      <div className="grid gap-1.5">
        {MEALS.map((meal) => (
          <WeekMeal key={meal} date={day.date} slot={day.meals[meal]} now={now} />
        ))}
      </div>
    </div>
  );

  return (
    <article
      className={`reveal press relative ${past ? "opacity-55 saturate-[0.7]" : ""}`}
      style={step(index)}
    >
      {current ? (
        <div className="ring glow lift rounded-[30px] p-[2px]">{body}</div>
      ) : (
        <div className="lift">{body}</div>
      )}
    </article>
  );
}

function WeekMeal({ date, slot, now }: { date: string; slot: MealSlot; now: Date }) {
  const meta = MEAL_META[slot.meal];
  const expired = !slot.dish && slot.status === "unplanned" && mealHasPassed(date, slot.meal, now);
  const name = slot.dish?.name ?? (expired ? "Nothing recorded" : STATUS[slot.status]);
  const category = slot.category;
  const cooked = slot.status === "cooked";

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-bg-sunken/55 px-3 py-2.5">
      <span className="w-6 flex-none text-center text-base">{category?.emoji ?? meta.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="bidi truncate text-sm font-bold">{name}</p>
        <p className="truncate text-[0.6875rem] text-ink-faint">
          {category ? (
            <>
              {category.name_en} <span className="fa">· {category.name_fa}</span>
            </>
          ) : (
            meta.label
          )}
        </p>
      </div>
      {cooked && <span className="text-sm text-pesteh">🌿</span>}
    </div>
  );
}
