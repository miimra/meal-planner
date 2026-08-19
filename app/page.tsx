"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import {
  MEALS,
  addDateDays,
  amsterdamMinutes,
  amsterdamToday,
  buildDay,
  dayLabel,
  mealHasPassed,
  dateFromKey,
  type MealSlot,
  type MealType,
  type PlanDay,
} from "./lib/plan.ts";
import { EFFORT_LABEL, type Category } from "./lib/categories.ts";
import { effortRange, rotationWeekOf } from "./lib/rotation.ts";
import { useMealPlan } from "./lib/useMealPlan.ts";
import { useCurrentTime } from "./lib/useCurrentTime.ts";

/** Where each meal sits on the day arc, and the emoji that stands for it. */
const MEAL_META = {
  breakfast: { icon: "☀️", label: "Breakfast", at: 8 * 60, clock: "08:00" },
  lunch: { icon: "🥪", label: "Lunch", at: 12 * 60 + 30, clock: "12:30" },
  dinner: { icon: "🌙", label: "Dinner", at: 18 * 60 + 30, clock: "18:30" },
} as const;

const STATUS = {
  unplanned: { icon: "✳️", title: "Not decided yet", detail: "The bot picks this one and tells you." },
  planned: { icon: "✨", title: "Planned", detail: "" },
  cooked: { icon: "🌿", title: "Cooked", detail: "Made today — nice one." },
  skipped: { icon: "🌾", title: "Skipped", detail: "Nothing planned. That's fine." },
  leftovers: { icon: "🥡", title: "Leftovers", detail: "Eat what's already made." },
  buy_food: { icon: "🛍️", title: "Buy something", detail: "Grab it ready-made." },
  eating_out: { icon: "🍽️", title: "Eating out", detail: "No cooking tonight." },
} as const;

const EFFORT_ICON = { quick: "⚡", medium: "🕒", "medium-heavy": "🕓", heavy: "🔥" } as const;

const DAY_START = 6 * 60;
const DAY_END = 23 * 60;
const arcPercent = (minutes: number) =>
  Math.min(100, Math.max(0, ((minutes - DAY_START) / (DAY_END - DAY_START)) * 100));

const step = (index: number) => ({ "--i": index }) as CSSProperties;

export default function HomePage() {
  const now = useCurrentTime();
  const today = amsterdamToday(now);
  const tomorrow = addDateDays(today, 1);
  const { assignments, categories, dishes, error, loading, refresh } = useMealPlan(today, tomorrow);

  const days = useMemo(
    () => [buildDay(today, categories, dishes, assignments), buildDay(tomorrow, categories, dishes, assignments)],
    [assignments, categories, dishes, today, tomorrow],
  );

  // The hero answers one question: what is happening at this table next?
  const focus = useMemo(() => {
    // Skip what is already cooked — the next open meal is the useful answer.
    const upcoming = MEALS.find(
      (meal) => !mealHasPassed(today, meal, now) && days[0].meals[meal].status !== "cooked",
    );
    return upcoming
      ? { day: days[0], meal: upcoming, when: "now" as const }
      : { day: days[1], meal: "breakfast" as MealType, when: "tomorrow" as const };
  }, [days, now, today]);

  if (loading) return <LoadingHome />;
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

  const restOfToday = MEALS.filter((meal) => !(focus.when === "now" && meal === focus.meal));
  const restOfTomorrow = MEALS.filter((meal) => !(focus.when === "tomorrow" && meal === "breakfast"));

  return (
    <main className="flex flex-col gap-9 pb-6">
      <Header now={now} today={today} />

      <Hero slot={focus.day.meals[focus.meal]} date={focus.day.date} when={focus.when} />

      <DayArc day={days[0]} now={now} />

      <Section title="Rest of today" index={0}>
        {restOfToday.map((meal, index) => (
          <MealRow key={meal} date={today} slot={days[0].meals[meal]} now={now} index={index} />
        ))}
      </Section>

      <Section title="Tomorrow" caption={dayLabel(tomorrow)} index={1}>
        {restOfTomorrow.map((meal, index) => (
          <MealRow key={meal} date={tomorrow} slot={days[1].meals[meal]} now={now} index={index} />
        ))}
      </Section>
    </main>
  );
}

/* ── Header ─────────────────────────────────────────────────────────────── */

function greeting(minutes: number): string {
  if (minutes < 11 * 60) return "Good morning";
  if (minutes < 17 * 60) return "Good afternoon";
  return "Good evening";
}

function Header({ now, today }: { now: Date; today: string }) {
  const minutes = amsterdamMinutes(now);
  const clock = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const week = rotationWeekOf(dateFromKey(today));

  return (
    <header className="pt-1">
      <div className="rise flex items-center justify-between gap-3" style={step(0)}>
        <p className="tick text-lapis">Sofreh · Week {week}</p>
        <p className="tabular flex items-center gap-px rounded-full border border-line bg-surface/70 px-3 py-1 text-sm font-bold text-ink-soft backdrop-blur-sm">
          {clock.slice(0, 2)}
          <span className="blink">:</span>
          {clock.slice(3)}
        </p>
      </div>
      <h1 className="font-display rise mt-3 text-[2.75rem] leading-[0.95] sm:text-5xl" style={step(1)}>
        {greeting(minutes)}
      </h1>
      <p className="rise mt-2 text-base text-ink-soft" style={step(2)}>
        {dayLabel(today)}
      </p>
    </header>
  );
}

/* ── Hero: the meal that is happening next, wrapped in a saffron ring ────── */

function Hero({ slot, date, when }: { slot: MealSlot; date: string; when: "now" | "tomorrow" }) {
  const meta = MEAL_META[slot.meal];
  const status = STATUS[slot.status];
  const category = slot.category ?? (slot.categoryOptions.length === 1 ? slot.categoryOptions[0] : null);
  const cooked = slot.status === "cooked";
  const title = slot.dish?.name ?? status.title;
  const detail = slot.dish ? (cooked ? status.detail : "Decided. Nothing to think about.") : status.detail;
  const persian = category?.name_fa ?? slot.categoryOptions.map((option) => option.name_fa).join(" یا ");

  const eyebrow =
    when === "tomorrow" ? "Tomorrow morning" : `${meta.label} · ${meta.clock}`;

  return (
    <section className="rise" style={step(3)}>
      <article className="ring glow press lift sheen relative rounded-[34px] p-[2px]">
        <span className="sheen-bar" aria-hidden />
        <div className="relative rounded-[32px] px-6 pb-6 pt-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="tick text-saffron-ink">{eyebrow}</p>
              <h2 className="font-display bidi mt-2 text-[2rem] leading-[1.05] text-balance">{title}</h2>
              {persian && <p className="fa mt-1.5 text-lg text-ink-soft">{persian}</p>}
            </div>
            <div className="relative flex h-20 w-20 flex-none items-center justify-center">
              <span
                className="halo absolute inset-0 rounded-full blur-xl"
                style={{ background: cooked ? "var(--pesteh-soft)" : "var(--saffron-soft)" }}
                aria-hidden
              />
              <span className="bob relative text-[3.25rem] leading-none">
                {category?.emoji ?? status.icon}
              </span>
            </div>
          </div>

          {detail && <p className="mt-4 text-[0.95rem] text-ink-soft">{detail}</p>}

          <div className="mt-5 flex flex-wrap gap-2">
            {category && <Chip tone="lapis">{category.emoji} {category.name_en}</Chip>}
            {category && (
              <Chip tone="saffron">
                {EFFORT_ICON[category.effort]} {EFFORT_LABEL[category.effort]} · {effortRange(category)}
              </Chip>
            )}
            {cooked && <Chip tone="pesteh">🌿 Cooked</Chip>}
            {!slot.dish && slot.status === "unplanned" && (
              <span className="shimmer rounded-full border border-line px-3 py-1.5 text-xs font-bold text-ink-faint">
                Waiting on the bot
              </span>
            )}
          </div>

          {slot.categoryOptions.length > 1 && (
            <ChoiceCallout options={slot.categoryOptions} />
          )}

          {category?.notes && (
            <p className="mt-4 rounded-2xl border border-dashed border-line bg-bg-sunken/60 px-4 py-3 text-sm text-ink-soft">
              {category.notes}
            </p>
          )}

          <p className="tick mt-5 text-ink-faint">{dayLabel(date, "short")}</p>
        </div>
      </article>
    </section>
  );
}

function ChoiceCallout({ options }: { options: Category[] }) {
  return (
    <div className="mt-4 grid gap-2">
      <p className="tick text-ink-faint">Your pick</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option, index) => (
          <div
            key={option.catId}
            className="pop rounded-2xl border border-line bg-bg-sunken/50 px-3 py-3 text-center"
            style={{ ...step(index), animationDelay: `${0.5 + index * 0.1}s` }}
          >
            <span className="block text-2xl">{option.emoji}</span>
            <span className="mt-1 block text-sm font-bold">{option.name_en}</span>
            <span className="fa mt-0.5 block text-xs text-ink-faint">{option.name_fa}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone: "lapis" | "saffron" | "pesteh"; children: React.ReactNode }) {
  const tones = {
    lapis: "bg-lapis-soft text-lapis-ink",
    saffron: "bg-saffron-soft text-saffron-ink",
    pesteh: "bg-pesteh-soft text-pesteh",
  } as const;
  return (
    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${tones[tone]}`}>{children}</span>
  );
}

/* ── The day arc: where we are between breakfast and bedtime ─────────────── */

function DayArc({ day, now }: { day: PlanDay; now: Date }) {
  const minutes = amsterdamMinutes(now);
  const progress = arcPercent(minutes);

  return (
    <section className="rise" style={step(4)} aria-label="Today at a glance">
      <div className="relative h-[4.75rem] rounded-[28px] border border-line bg-surface/60 px-6 backdrop-blur-sm">
        <div className="absolute inset-x-6 top-[2.6rem] h-[3px] rounded-full bg-line" />
        <div
          className="draw absolute left-6 top-[2.6rem] h-[3px] rounded-full"
          style={{
            width: `calc((100% - 3rem) * ${progress / 100})`,
            background: "linear-gradient(90deg, var(--lapis), var(--saffron))",
          }}
        />
        <div className="absolute inset-x-6 top-0 h-full">
          {MEALS.map((meal) => {
            const meta = MEAL_META[meal];
            const slot = day.meals[meal];
            const done = minutes >= meta.at;
            return (
              <div
                key={meal}
                className="pop absolute top-[0.6rem] flex w-16 -translate-x-1/2 flex-col items-center"
                style={{ left: `${arcPercent(meta.at)}%`, animationDelay: `${0.6 + MEALS.indexOf(meal) * 0.12}s` }}
              >
                <span className={`text-base leading-none ${done ? "opacity-45" : ""}`}>{meta.icon}</span>
                <span
                  className="mt-[0.45rem] h-[9px] w-[9px] rounded-full border-2"
                  style={{
                    borderColor: done ? "var(--saffron)" : "var(--line)",
                    background: slot.dish || slot.status === "cooked" ? "var(--saffron)" : "var(--surface)",
                  }}
                />
                <span className="tick mt-[0.35rem] text-[0.5625rem] text-ink-faint">{meta.clock}</span>
              </div>
            );
          })}
          <div
            className="absolute top-[2.3rem] -translate-x-1/2"
            style={{ left: `${progress}%`, transition: "left 1s cubic-bezier(0.16,1,0.3,1)" }}
          >
            <span className="relative flex h-[13px] w-[13px] items-center justify-center">
              <span className="ping absolute h-full w-full rounded-full bg-anar" aria-hidden />
              <span className="relative h-[13px] w-[13px] rounded-full border-2 border-surface bg-anar shadow-[var(--shadow-sm)]" />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Sections and compact rows ──────────────────────────────────────────── */

function Section({
  title,
  caption,
  index,
  children,
}: {
  title: string;
  caption?: string;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="rise mb-3 flex items-baseline justify-between gap-3 px-1" style={step(5 + index)}>
        <h2 className="font-display text-xl">{title}</h2>
        {caption && <p className="tick text-ink-faint">{caption}</p>}
      </div>
      <div className="grid gap-2.5">{children}</div>
    </section>
  );
}

function MealRow({
  date,
  slot,
  now,
  index,
}: {
  date: string;
  slot: MealSlot;
  now: Date;
  index: number;
}) {
  const meta = MEAL_META[slot.meal];
  const status = STATUS[slot.status];
  const passed = mealHasPassed(date, slot.meal, now);
  const expired = !slot.dish && slot.status === "unplanned" && passed;
  const cooked = slot.status === "cooked";
  const title = slot.dish?.name ?? (expired ? "Nothing recorded" : status.title);
  const category = slot.category ?? (slot.categoryOptions.length === 1 ? slot.categoryOptions[0] : null);

  return (
    <article
      className={`reveal press lift flex items-center gap-4 rounded-[26px] border border-line bg-surface/80 px-4 py-4 shadow-[var(--shadow-sm)] backdrop-blur-sm ${
        passed && !cooked ? "opacity-60" : ""
      }`}
      style={step(index)}
    >
      <span
        className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl text-2xl"
        style={{ background: cooked ? "var(--pesteh-soft)" : "var(--bg-sunken)" }}
      >
        {category?.emoji ?? (slot.dish ? meta.icon : status.icon)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="tick text-ink-faint">
          {meta.label} · {meta.clock}
        </p>
        <p className="bidi mt-1 truncate font-bold text-[1.0625rem]">{title}</p>
        {category ? (
          <p className="mt-0.5 truncate text-xs text-ink-soft">
            {category.name_en} <span className="fa">· {category.name_fa}</span>
          </p>
        ) : (
          slot.categoryOptions.length > 1 && (
            <p className="mt-0.5 truncate text-xs text-ink-soft">
              {slot.categoryOptions.map((option) => `${option.emoji} ${option.name_en}`).join(" or ")}
            </p>
          )
        )}
      </div>
      {cooked && <span className="pop text-lg text-pesteh">🌿</span>}
    </article>
  );
}

/* ── Loading ────────────────────────────────────────────────────────────── */

function LoadingHome() {
  return (
    <main className="flex flex-col gap-8 pt-2" aria-busy>
      <div className="shimmer h-28 rounded-[28px] border border-line bg-surface/60" style={step(0)} />
      <div className="shimmer h-64 rounded-[34px] border border-line bg-surface/60" style={step(1)} />
      <div className="shimmer h-[4.75rem] rounded-[28px] border border-line bg-surface/60" style={step(2)} />
      {[0, 1, 2].map((row) => (
        <div key={row} className="shimmer h-20 rounded-[26px] border border-line bg-surface/60" />
      ))}
    </main>
  );
}
