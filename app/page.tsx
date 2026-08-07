"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Category } from "./lib/categories";
import { addDays, dateKey, planForDate, PlanDay } from "./lib/rotation";
import { Dish, useDishes } from "./lib/store";
import { splitDishName } from "./lib/dishName";
import { ClayPill, EffortBadge, EmojiTile } from "./components/badges";

const SUNDAY_KEY = "mp_sunday_v1";

function readSundayChoice(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const map = JSON.parse(window.localStorage.getItem(SUNDAY_KEY) || "{}");
    return map[key] ?? null;
  } catch {
    return null;
  }
}
function writeSundayChoice(key: string, categoryId: number | null) {
  const map = JSON.parse(window.localStorage.getItem(SUNDAY_KEY) || "{}");
  if (categoryId === null) delete map[key];
  else map[key] = categoryId;
  window.localStorage.setItem(SUNDAY_KEY, JSON.stringify(map));
}

export default function TodayPage() {
  const [mounted, setMounted] = useState(false);
  const [today] = useState(() => new Date());
  const { forCategory, markCooked } = useDishes();

  const todayKey = dateKey(today);
  const plan = useMemo(() => planForDate(today), [today]);
  const tomorrowPlan = useMemo(() => planForDate(addDays(today, 1)), [today]);

  const [sunday, setSunday] = useState<number | null>(null);
  useEffect(() => {
    setMounted(true);
    setSunday(readSundayChoice(todayKey));
  }, [todayKey]);

  if (!mounted) {
    return <div className="h-64 animate-pulse rounded-3xl bg-bg-elevated" />;
  }

  // Design shows "Monday · 13 July".
  const weekday = today.toLocaleDateString("en-GB", { weekday: "long" });
  const dayMonth = today.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const dateDot = `${weekday} · ${dayMonth}`;

  const chosen =
    plan.kind === "sunday-choice" && sunday !== null
      ? plan.choices!.find((c) => c.id === sunday)
      : plan.category;

  return (
    <main className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{dateDot}</h1>
          <p className="mt-0.5 text-sm text-ink-faint">✨ Tonight&apos;s little plan</p>
        </div>
        <ClayPill>Week {plan.week}</ClayPill>
      </header>

      {plan.kind === "eat-out" && <EatOutCard />}

      {plan.kind === "sunday-choice" && sunday === null && (
        <SundayChooser
          choices={plan.choices!}
          onPick={(id) => {
            writeSundayChoice(todayKey, id);
            setSunday(id);
          }}
        />
      )}

      {chosen && (
        <>
          <HeroCard
            category={chosen}
            onChangeChoice={
              plan.kind === "sunday-choice"
                ? () => {
                    writeSundayChoice(todayKey, null);
                    setSunday(null);
                  }
                : undefined
            }
          />
          <DishList
            dishes={forCategory(chosen.id)}
            todayKey={todayKey}
            onToggle={markCooked}
          />
        </>
      )}

      <TomorrowPreview plan={tomorrowPlan} />
    </main>
  );
}

// ── Hero card ────────────────────────────────────────────────────────────────

function HeroCard({
  category,
  onChangeChoice,
}: {
  category: Category;
  onChangeChoice?: () => void;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-[32px] p-5"
      style={{
        background:
          "linear-gradient(150deg, var(--hero-from), var(--hero-via) 55%, var(--hero-to))",
        boxShadow: "var(--shadow)",
        border: "1px solid var(--line)",
      }}
    >
      <span className="animate-twinkle pointer-events-none absolute right-5 top-4 text-lg">
        ✨
      </span>
      <span
        className="animate-twinkle pointer-events-none absolute right-12 top-10 text-xs"
        style={{ animationDelay: "0.9s" }}
      >
        ⭐
      </span>

      <div className="flex items-start gap-4">
        <EmojiTile emoji={category.emoji} />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-xs font-extrabold uppercase tracking-widest text-accent">
            ✨ Tonight
          </p>
          <h2 className="font-display mt-1 text-[28px] font-bold leading-tight tracking-tight">
            {category.name_en}
          </h2>
          <p className="fa mt-1 text-lg text-ink-soft">{category.name_fa}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <EffortBadge category={category} />
        {onChangeChoice && (
          <button
            onClick={onChangeChoice}
            className="text-sm font-semibold text-accent underline underline-offset-2"
          >
            Change choice
          </button>
        )}
      </div>

      {category.notes && (
        <p className="mt-4 rounded-2xl bg-clay-soft px-4 py-3 text-sm font-medium text-clay-ink">
          💡 {category.notes}
        </p>
      )}
    </section>
  );
}

// ── Dish list ────────────────────────────────────────────────────────────────

function DishList({
  dishes,
  todayKey,
  onToggle,
}: {
  dishes: Dish[];
  todayKey: string;
  onToggle: (id: string, key: string) => void;
}) {
  const cookedToday = dishes.find((d) => d.lastCooked === todayKey);

  if (dishes.length === 0) {
    return (
      <section>
        <SectionLabel>Cook one of these</SectionLabel>
        <p className="rounded-2xl bg-bg-elevated p-4 text-sm text-ink-faint" style={{ boxShadow: "var(--shadow-sm)" }}>
          No dishes yet — add your options in the{" "}
          <Link href="/dishes" className="font-medium text-accent underline underline-offset-2">
            Dishes
          </Link>{" "}
          tab.
        </p>
      </section>
    );
  }

  return (
    <section>
      <SectionLabel>Cook one of these</SectionLabel>
      <ul className="flex flex-col gap-2.5">
        {dishes.map((dish) => (
          <DishCard
            key={dish.id}
            dish={dish}
            cooked={dish.lastCooked === todayKey}
            onToggle={() => onToggle(dish.id, todayKey)}
          />
        ))}
      </ul>
      {cookedToday && (
        <p className="animate-pop mt-4 flex items-center justify-center gap-1.5 rounded-2xl bg-good-soft py-2.5 text-center text-sm font-bold text-good">
          🌸 Cooked today — you did it! ✨
        </p>
      )}
    </section>
  );
}

function DishCard({
  dish,
  cooked,
  onToggle,
}: {
  dish: Dish;
  cooked: boolean;
  onToggle: () => void;
}) {
  const { primary, primaryFa, secondary, secondaryFa } = splitDishName(dish.name);
  return (
    <li>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-[22px] px-4 py-3.5 text-left transition-all active:scale-[0.98]"
        style={{
          background: cooked ? "var(--good-soft)" : "var(--bg-elevated)",
          boxShadow: "var(--shadow-sm)",
          outline: cooked ? "2px solid var(--good)" : "2px solid transparent",
        }}
      >
        <div className="min-w-0 flex-1">
          <p
            className={`font-bold ${primaryFa ? "fa" : ""} ${
              cooked ? "text-ink-soft line-through" : ""
            }`}
          >
            {primary}
          </p>
          {secondary && (
            <p
              className={`mt-0.5 text-right text-sm text-ink-faint ${
                secondaryFa ? "fa" : ""
              }`}
            >
              {secondary}
            </p>
          )}
        </div>
        <span
          className={`flex h-8 w-8 flex-none items-center justify-center rounded-full border-2 text-sm ${
            cooked ? "animate-pop" : ""
          }`}
          style={{
            borderColor: cooked ? "var(--good)" : "var(--line)",
            background: cooked ? "var(--good)" : "transparent",
            color: "#fff",
          }}
        >
          {cooked ? "🌸" : ""}
        </span>
      </button>
    </li>
  );
}

// ── Weekend & shared bits ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display mb-3 px-1 text-sm font-bold text-ink-soft">
      {children}
    </h3>
  );
}

function EatOutCard() {
  return (
    <section
      className="relative overflow-hidden rounded-[32px] p-6"
      style={{
        background:
          "linear-gradient(150deg, var(--hero-from), var(--hero-via) 55%, var(--hero-to))",
        boxShadow: "var(--shadow)",
        border: "1px solid var(--line)",
      }}
    >
      <span className="animate-twinkle pointer-events-none absolute right-6 top-5 text-lg">
        ✨
      </span>
      <div className="flex items-center gap-4">
        <EmojiTile emoji="🍴" />
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-accent">
            ✨ Tonight
          </p>
          <h2 className="font-display mt-1 text-2xl font-bold tracking-tight">
            Eating out
          </h2>
          <p className="mt-1 text-ink-soft">No plan tonight. Relax and enjoy 💛</p>
        </div>
      </div>
    </section>
  );
}

function SundayChooser({
  choices,
  onPick,
}: {
  choices: Category[];
  onPick: (id: number) => void;
}) {
  return (
    <section>
      <SectionLabel>🌙 Sunday — your pick</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        {choices.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
            className="flex flex-col items-center gap-1 rounded-[26px] bg-bg-elevated p-5 text-center transition-all active:scale-[0.97]"
            style={{ boxShadow: "var(--shadow-sm)", border: "2px solid var(--line)" }}
          >
            <span className="animate-bob text-5xl">{c.emoji}</span>
            <span className="font-display mt-2 font-bold">{c.name_en}</span>
            <span className="fa text-sm text-ink-soft">{c.name_fa}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

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
      className="flex items-center justify-between rounded-[20px] border-2 border-line bg-bg-elevated/60 px-4 py-3 text-sm transition-colors active:scale-[0.99]"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <span className="text-ink-faint">🌷 Tomorrow · {plan.dayName}</span>
      <span className="font-display font-bold text-ink">{label}</span>
    </Link>
  );
}
