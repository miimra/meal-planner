"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { pb } from "../lib/pb.ts";
import { EFFORT_LABEL, STYLE_LABEL, findCategory, type Category } from "../lib/categories.ts";
import { amsterdamToday, dateFromKey } from "../lib/plan.ts";
import {
  DAY_NAMES,
  effortRange,
  planForDay,
  rotationWeekOf,
  toDayIndex,
  type DayIndex,
  type RotationWeek,
} from "../lib/rotation.ts";
import { mapCategoryRecord, type CategoryRecord } from "../lib/useMealPlan.ts";
import { useCurrentTime } from "../lib/useCurrentTime.ts";

const DAY_FA = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه"] as const;
const EFFORT_ICON = { quick: "⚡", medium: "🕒", "medium-heavy": "🕓", heavy: "🔥" } as const;
const DAYS: DayIndex[] = [0, 1, 2, 3, 4, 5, 6];

const step = (index: number) => ({ "--i": index }) as CSSProperties;

/** Split "Intro. Examples: a, b, c." into its two halves for display. */
function splitNotes(notes: string | undefined): { intro: string; examples: string[] } {
  const value = (notes ?? "").trim();
  const marker = value.indexOf("Examples:");
  if (marker === -1) return { intro: value, examples: [] };
  const intro = value.slice(0, marker).trim();
  const rest = value.slice(marker + "Examples:".length).trim();
  // The example list ends at the first full stop; anything after is a rule.
  const end = rest.indexOf(".");
  const list = end === -1 ? rest : rest.slice(0, end);
  const tail = end === -1 ? "" : rest.slice(end + 1).trim();
  const examples = list.split(",").map((item) => item.trim()).filter(Boolean);
  return { intro: [intro, tail].filter(Boolean).join(" "), examples };
}

function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const records = await pb.collection("categories").getFullList<CategoryRecord>({ sort: "catId" });
      setCategories(records.map(mapCategoryRecord));
      setError(null);
    } catch {
      setError("Couldn’t load the categories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { categories, error, loading, refresh };
}

export default function CategoriesPage() {
  const now = useCurrentTime();
  const today = amsterdamToday(now);
  const todayDate = dateFromKey(today);
  const currentWeek = rotationWeekOf(todayDate);
  const todayIndex = toDayIndex(todayDate);
  const { categories, error, loading, refresh } = useCategories();

  if (loading) {
    return (
      <main className="flex flex-col gap-6 pt-2" aria-busy>
        <div className="shimmer h-28 rounded-[28px] border border-line bg-surface/60" />
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="shimmer h-36 rounded-[30px] border border-line bg-surface/60" />
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

  const weeks: RotationWeek[] = currentWeek === 1 ? [1, 2] : [2, 1];

  return (
    <main className="flex flex-col gap-8 pb-6">
      <header className="pt-1">
        <p className="tick rise text-lapis" style={step(0)}>
          Two-week dinner rotation
        </p>
        <h1 className="font-display rise mt-3 text-[2.75rem] leading-[0.95]" style={step(1)}>
          The categories
        </h1>
        <p className="rise mt-2 text-base text-ink-soft" style={step(2)}>
          Each day has one theme. Saturdays we eat out. This is rotation week {currentWeek}.
        </p>
      </header>

      {weeks.map((week, position) => (
        <WeekSection
          key={week}
          week={week}
          current={week === currentWeek}
          todayIndex={todayIndex}
          categories={categories}
          offset={3 + position * 8}
        />
      ))}
    </main>
  );
}

function WeekSection({
  week,
  current,
  todayIndex,
  categories,
  offset,
}: {
  week: RotationWeek;
  current: boolean;
  todayIndex: DayIndex;
  categories: Category[];
  offset: number;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={`Rotation week ${week}`}>
      <div className="rise flex items-baseline justify-between px-1" style={step(offset)}>
        <h2 className="font-display text-2xl leading-tight">Week {week}</h2>
        <span className={`tick ${current ? "text-saffron-ink" : "text-ink-faint"}`}>
          {current ? "This week" : "Next week"}
        </span>
      </div>
      {DAYS.map((day, index) => {
        const plan = planForDay(week, day);
        const category = plan.categoryId !== undefined ? findCategory(categories, plan.categoryId) : undefined;
        const isToday = current && day === todayIndex;
        return (
          <DayRow
            key={day}
            day={day}
            category={category}
            eatOut={plan.kind === "eat-out"}
            today={isToday}
            index={offset + 1 + index}
          />
        );
      })}
    </section>
  );
}

function DayRow({
  day,
  category,
  eatOut,
  today,
  index,
}: {
  day: DayIndex;
  category: Category | undefined;
  eatOut: boolean;
  today: boolean;
  index: number;
}) {
  const body = (
    <div
      className={`relative rounded-[28px] px-4 py-4 ${
        today ? "" : "border border-line bg-surface/80 shadow-[var(--shadow-sm)] backdrop-blur-sm"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="h-2.5 w-2.5 flex-none rounded-full border-2"
            style={{
              borderColor: today ? "var(--saffron)" : "var(--line)",
              background: today ? "var(--saffron)" : "transparent",
            }}
            aria-hidden
          />
          <div>
            <h3 className="font-display text-lg leading-tight">{DAY_NAMES[day]}</h3>
            <p className="fa text-xs font-semibold text-ink-faint">{DAY_FA[day]}</p>
          </div>
        </div>
        {today && (
          <span className="rounded-full bg-saffron px-3 py-1 text-[0.6875rem] font-extrabold uppercase tracking-widest text-surface">
            Today
          </span>
        )}
      </div>

      {eatOut ? (
        <div className="flex items-center gap-3 rounded-2xl bg-bg-sunken/55 px-3 py-3">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-bg-sunken text-2xl">🍽️</span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[1.0625rem]">Eating out</p>
            <p className="fa mt-0.5 text-sm text-ink-soft">بیرون غذا می‌خوریم</p>
          </div>
        </div>
      ) : category ? (
        <CategoryCard category={category} />
      ) : (
        <p className="rounded-2xl bg-bg-sunken/55 px-3 py-3 text-sm text-ink-faint">Category not loaded yet.</p>
      )}
    </div>
  );

  return (
    <article className="reveal press relative" style={step(index)}>
      {today ? <div className="ring glow lift rounded-[30px] p-[2px]">{body}</div> : <div className="lift">{body}</div>}
    </article>
  );
}

function CategoryCard({ category }: { category: Category }) {
  const { intro, examples } = splitNotes(category.notes);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-bg-sunken text-2xl">
          {category.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="bidi font-bold text-[1.0625rem] leading-snug">{category.name_en}</p>
          <p className="fa mt-0.5 text-base text-ink-soft">
            {category.emoji} {category.name_fa}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip>{STYLE_LABEL[category.style]}</Chip>
        <Chip>
          {EFFORT_ICON[category.effort]} {EFFORT_LABEL[category.effort]} · {effortRange(category)}
        </Chip>
        {category.weekend_only && <Chip>🛋️ Weekend only</Chip>}
        {category.prep_ahead && <Chip>🕰️ Prep ahead</Chip>}
      </div>

      {intro && <p className="text-sm text-ink-soft">{intro}</p>}

      {examples.length > 0 && (
        <div>
          <p className="tick mb-1.5 text-ink-faint">Examples</p>
          <ul className="flex flex-wrap gap-1.5">
            {examples.map((example) => (
              <li
                key={example}
                className="bidi rounded-xl border border-dashed border-line bg-bg-sunken/60 px-2.5 py-1 text-xs font-semibold text-ink-soft"
              >
                {example}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-ink-soft">{children}</span>
  );
}
