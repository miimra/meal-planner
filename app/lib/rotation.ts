import type { Category } from "./categories.ts";
import { findCategory } from "./categories.ts";

// ── Day model ────────────────────────────────────────────────────────────────
// We work in Monday-first order to match the rotation tables in the README.

export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday … 6 = Sunday
export type RotationWeek = 1 | 2;

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Convert a JS Date (getDay: 0=Sun..6=Sat) into our Monday-first index. */
export function toDayIndex(date: Date): DayIndex {
  return ((date.getDay() + 6) % 7) as DayIndex;
}

/** Local YYYY-MM-DD key (avoids UTC off-by-one from toISOString). */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The Monday (00:00 local) of the week containing `date`. */
export function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - toDayIndex(d));
  return d;
}

// Jan 1 2024 was a Monday — a stable anchor for week-parity.
const ANCHOR = new Date(2024, 0, 1);
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Which half of the 2-week rotation the given date falls in. */
export function rotationWeekOf(date: Date): RotationWeek {
  const weeks = Math.round((mondayOf(date).getTime() - ANCHOR.getTime()) / MS_PER_WEEK);
  return ((((weeks % 2) + 2) % 2) === 0 ? 1 : 2) as RotationWeek;
}

// ── The plan ─────────────────────────────────────────────────────────────────
// Category id for each weekday, per rotation week. `null` = special handling
// (weekend). See README "The 2-Week Rotation". This table only knows catIds —
// it has no dependency on where/how category content is loaded.

const WEEK_1: (number | null)[] = [5, 1, 6, 4, 7, null, null];
const WEEK_2: (number | null)[] = [12, 11, 10, 9, 8, null, null];

export type DayKind = "weekday" | "eat-out" | "sunday-choice";

export interface PlanDay {
  day: DayIndex;
  dayName: string;
  week: RotationWeek;
  kind: DayKind;
  /** Resolved category id for weekdays. Undefined for weekends. */
  categoryId?: number;
  /** Sunday offers a choice between these two category ids. */
  choiceIds?: number[];
}

/** Resolve the plan for a specific weekday index within a rotation week. */
export function planForDay(week: RotationWeek, day: DayIndex): PlanDay {
  const dayName = DAY_NAMES[day];

  if (day === 5) {
    return { day, dayName, week, kind: "eat-out" };
  }
  if (day === 6) {
    return { day, dayName, week, kind: "sunday-choice", choiceIds: [2, 3] };
  }

  const table = week === 1 ? WEEK_1 : WEEK_2;
  const catId = table[day]!;
  return { day, dayName, week, kind: "weekday", categoryId: catId };
}

/** The plan for an actual calendar date. */
export function planForDate(date: Date): PlanDay {
  return planForDay(rotationWeekOf(date), toDayIndex(date));
}

/** The seven PlanDays (Mon→Sun) for the week containing `date`. */
export function weekPlan(date: Date): PlanDay[] {
  const week = rotationWeekOf(date);
  return DAY_NAMES.map((_, i) => planForDay(week, i as DayIndex));
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

/** Human label for effort + minute range, e.g. "20–30 min". */
export function effortRange(category: Category): string {
  const [a, b] = category.effort_minutes;
  return `${a}–${b} min`;
}

// ── Display labels ───────────────────────────────────────────────────────────

export interface PlanLabel {
  emoji: string;
  title: string;
  fa?: string;
}

/** Resolve a PlanDay into what to show, given the currently-loaded categories. */
export function planLabel(plan: PlanDay, categories: Category[]): PlanLabel {
  if (plan.kind === "eat-out") return { emoji: "🍴", title: "Eating out" };
  if (plan.kind === "sunday-choice") {
    return { emoji: "🍢", title: "Your pick", fa: "کبابی یا خورشت" };
  }
  const category =
    plan.categoryId !== undefined ? findCategory(categories, plan.categoryId) : undefined;
  return {
    emoji: category?.emoji ?? "❓",
    title: category?.name_en ?? "Unknown",
    fa: category?.name_fa,
  };
}
