"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import {
  addDateDays,
  amsterdamMinutes,
  amsterdamToday,
  buildDay,
  dayLabel,
  mealHasPassed,
  mondayKey,
  dateFromKey,
  type MealSlot,
  type PlanDay,
} from "./lib/plan.ts";
import { EFFORT_LABEL, type Category } from "./lib/categories.ts";
import { DAY_SHORT, effortRange, rotationWeekOf, toDayIndex } from "./lib/rotation.ts";
import { useMealPlan } from "./lib/useMealPlan.ts";
import { useCurrentTime } from "./lib/useCurrentTime.ts";

const DINNER_CLOCK = "18:30";

const STATUS = {
  unplanned: { icon: "✳️", title: "Not decided yet", detail: "Pick it from the Sunday message." },
  planned: { icon: "✨", title: "Planned", detail: "" },
  cooked: { icon: "🌿", title: "Cooked", detail: "Made tonight — nice one." },
  skipped: { icon: "🌾", title: "Skipped", detail: "Nothing planned. That's fine." },
  leftovers: { icon: "🥡", title: "Leftovers", detail: "Eat what's already made." },
  buy_food: { icon: "🛍️", title: "Buy something", detail: "Grab it ready-made." },
  eating_out: { icon: "🍽️", title: "Eating out", detail: "No cooking tonight." },
} as const;

const EFFORT_ICON = { quick: "⚡", medium: "🕒", "medium-heavy": "🕓", heavy: "🔥" } as const;

const RAIL_TOP = "2.6rem";
const RAIL_CENTER = "calc(2.6rem + 1.5px)";

const step = (index: number) => ({ "--i": index }) as CSSProperties;

/** A dinner counts as settled once it has a dish or a deliberate non-cooking choice. */
function decided(slot: MealSlot): boolean {
  return Boolean(slot.dish) || ["cooked", "skipped", "leftovers", "buy_food", "eating_out"].includes(slot.status);
}

export default function HomePage() {
  const now = useCurrentTime();
  const today = amsterdamToday(now);
  const weekStart = mondayKey(today);
  const weekEnd = addDateDays(weekStart, 6);
  const { assignments, categories, dishes, error, loading, refresh } = useMealPlan(weekStart, addDateDays(weekEnd, 1));

  const days = useMemo(
    () => Array.from({ length: 8 }, (_, index) => buildDay(addDateDays(weekStart, index), categories, dishes, assignments)),
    [assignments, categories, dishes, weekStart],
  );
  const week = days.slice(0, 7);

  // Tonight, unless tonight is behind us or already cooked — then tomorrow.
  const focus = useMemo(() => {
    const todayIndex = week.findIndex((day) => day.date === today);
    const tonight = week[todayIndex];
    const tonightOpen = tonight && !mealHasPassed(today, "dinner", now) && tonight.meals.dinner.status !== "cooked";
    return tonightOpen ? { day: tonight, when: "tonight" as const } : { day: days[todayIndex + 1], when: "tomorrow" as const };
  }, [days, now, today, week]);

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

  const ahead = days.filter((day) => day.date > (focus.day?.date ?? today)).slice(0, 5);

  return (
    <main className="flex flex-col gap-9 pb-6">
      <Header now={now} today={today} />
      {focus.day && <Hero slot={focus.day.meals.dinner} date={focus.day.date} when={focus.when} />}
      <WeekRail week={week} today={today} />
      <Section title="Coming up" caption={`${week.filter((day) => decided(day.meals.dinner)).length}/7 planned`}>
        {ahead.map((day, index) => (
          <DinnerRow key={day.date} day={day} now={now} index={index} />
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

  return (
    <header className="pt-1">
      <div className="rise flex items-center justify-between gap-3" style={step(0)}>
        <p className="tick text-lapis">Sofreh · Week {rotationWeekOf(dateFromKey(today))}</p>
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

/* ── Hero: tonight's dinner, ringed by a tracing saffron arc ─────────────── */

function Hero({ slot, date, when }: { slot: MealSlot; date: string; when: "tonight" | "tomorrow" }) {
  const status = STATUS[slot.status];
  const category = slot.category ?? (slot.categoryOptions.length === 1 ? slot.categoryOptions[0] : null);
  const cooked = slot.status === "cooked";
  const title = slot.dish?.name ?? status.title;
  const detail = slot.dish ? (cooked ? status.detail : "Decided. Nothing to think about.") : status.detail;
  const persian = category?.name_fa ?? slot.categoryOptions.map((option) => option.name_fa).join(" یا ");

  return (
    <section className="rise" style={step(3)}>
      <article className="ring glow press lift sheen relative rounded-[34px] p-[2px]">
        <span className="sheen-bar" aria-hidden />
        <div className="relative rounded-[32px] px-6 pb-6 pt-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="tick text-saffron-ink">
                {when === "tonight" ? `Tonight · ${DINNER_CLOCK}` : "Tomorrow night"}
              </p>
              <h2 className="font-display bidi mt-2 text-[2rem] leading-[1.05] text-balance">{title}</h2>
              {persian && <p className="fa mt-1.5 text-lg text-ink-soft">{persian}</p>}
            </div>
            <div className="relative flex h-20 w-20 flex-none items-center justify-center">
              <span
                className="halo absolute inset-0 rounded-full blur-xl"
                style={{ background: cooked ? "var(--pesteh-soft)" : "var(--saffron-soft)" }}
                aria-hidden
              />
              <span className="bob relative text-[3.25rem] leading-none">{category?.emoji ?? status.icon}</span>
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

          {slot.categoryOptions.length > 1 && <ChoiceCallout options={slot.categoryOptions} />}

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
  return <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

/* ── The week rail: how much of Monday-to-Sunday is settled ─────────────── */

function WeekRail({ week, today }: { week: PlanDay[]; today: string }) {
  const todayIndex = Math.max(0, week.findIndex((day) => day.date === today));
  const position = (index: number) => (index / 6) * 100;
  const onRail = "absolute -translate-x-1/2 -translate-y-1/2";

  return (
    <section className="rise" style={step(4)} aria-label="Dinners this week">
      <div className="relative h-[4.75rem] rounded-[28px] border border-line bg-surface/60 px-7 backdrop-blur-sm">
        <div className="absolute inset-x-7 h-[3px] rounded-full bg-line" style={{ top: RAIL_TOP }} />
        <div
          className="draw absolute left-7 h-[3px] rounded-full"
          style={{
            top: RAIL_TOP,
            width: `calc((100% - 3.5rem) * ${position(todayIndex) / 100})`,
            background: "linear-gradient(90deg, var(--lapis), var(--saffron))",
          }}
        />
        <div className="absolute inset-x-7 top-0 h-full">
          {week.map((day, index) => {
            const slot = day.meals.dinner;
            const settled = decided(slot);
            const past = day.date < today;
            return (
              <div
                key={day.date}
                className={`pop ${onRail}`}
                style={{ top: RAIL_CENTER, left: `${position(index)}%`, animationDelay: `${0.6 + index * 0.07}s` }}
              >
                <span
                  className="block h-[9px] w-[9px] rounded-full border-2"
                  style={{
                    borderColor: past || settled ? "var(--saffron)" : "var(--line)",
                    background: settled ? "var(--saffron)" : "var(--surface)",
                  }}
                />
                <span className={`absolute bottom-full left-1/2 mb-[0.45rem] -translate-x-1/2 text-sm leading-none ${past ? "opacity-45" : ""}`}>
                  {slot.category?.emoji ?? slot.categoryOptions[0]?.emoji ?? (slot.status === "eating_out" ? "🍽️" : "·")}
                </span>
                <span className="tick absolute left-1/2 top-full mt-[0.45rem] -translate-x-1/2 text-[0.5625rem] text-ink-faint">
                  {DAY_SHORT[toDayIndex(dateFromKey(day.date))]}
                </span>
              </div>
            );
          })}
          <div className={onRail} style={{ top: RAIL_CENTER, left: `${position(todayIndex)}%` }}>
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

/* ── Sections and rows ──────────────────────────────────────────────────── */

function Section({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="rise mb-3 flex items-baseline justify-between gap-3 px-1" style={step(5)}>
        <h2 className="font-display text-xl">{title}</h2>
        {caption && <p className="tick text-ink-faint">{caption}</p>}
      </div>
      <div className="grid gap-2.5">{children}</div>
    </section>
  );
}

function DinnerRow({ day, now, index }: { day: PlanDay; now: Date; index: number }) {
  const slot = day.meals.dinner;
  const status = STATUS[slot.status];
  const passed = mealHasPassed(day.date, "dinner", now);
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
        {category?.emoji ?? status.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="tick text-ink-faint">{dayLabel(day.date, "short")}</p>
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
      <div className="shimmer h-28 rounded-[28px] border border-line bg-surface/60" />
      <div className="shimmer h-64 rounded-[34px] border border-line bg-surface/60" />
      <div className="shimmer h-[4.75rem] rounded-[28px] border border-line bg-surface/60" />
      {[0, 1, 2].map((row) => (
        <div key={row} className="shimmer h-20 rounded-[26px] border border-line bg-surface/60" />
      ))}
    </main>
  );
}
