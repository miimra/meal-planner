import type { Category } from "./categories.ts";
import { findCategory } from "./categories.ts";

// ── Day model ────────────────────────────────────────────────────────────────
// We work in Monday-first order to match the rotation table in docs/meal-categories.md.

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
// The rotation lives in PocketBase's `dinner_rotation` collection (one row per
// week 1|2 and weekday 0–6, holding a category or `kind = eat_out`) and is
// edited through the MCP `set_rotation_day` tool. This module only knows how
// to turn the fetched rows into a lookup table and resolve a date against it;
// it has no dependency on where/how category content is loaded.

/** Category id (catId) per weekday Monday → Sunday; `null` = eating out. A missing entry means the slot is not loaded/set. */
export type RotationTable = Record<RotationWeek, (number | null | undefined)[]>;

/** Rotation lookup before the rows have loaded: every slot unset. */
export const EMPTY_ROTATION: RotationTable = { 1: [], 2: [] };

/** A `dinner_rotation` row fetched with `expand: "category"`. */
export interface RotationRecord {
  week: number;
  weekday: number;
  kind?: string;
  category?: string;
  expand?: { category?: { catId: number } };
}

/** Build the lookup table from the fetched `dinner_rotation` rows. */
export function rotationTableFromRecords(records: RotationRecord[]): RotationTable {
  const table: RotationTable = { 1: [], 2: [] };
  for (const record of records) {
    if (record.week !== 1 && record.week !== 2) continue;
    if (!Number.isInteger(record.weekday) || record.weekday < 0 || record.weekday > 6) continue;
    if (record.kind === "eat_out") table[record.week][record.weekday] = null;
    else if (record.expand?.category) table[record.week][record.weekday] = record.expand.category.catId;
  }
  return table;
}

export type DayKind = "weekday" | "eat-out" | "unset";

export interface PlanDay {
  day: DayIndex;
  dayName: string;
  week: RotationWeek;
  kind: DayKind;
  /** Resolved category id for cooking days. Undefined for eat-out and unset days. */
  categoryId?: number;
}

/** Resolve the plan for a specific weekday index within a rotation week. */
export function planForDay(table: RotationTable, week: RotationWeek, day: DayIndex): PlanDay {
  const dayName = DAY_NAMES[day];
  const catId = table[week][day];
  if (catId === undefined) return { day, dayName, week, kind: "unset" };
  if (catId === null) return { day, dayName, week, kind: "eat-out" };
  return { day, dayName, week, kind: "weekday", categoryId: catId };
}

/** The plan for an actual calendar date. */
export function planForDate(table: RotationTable, date: Date): PlanDay {
  return planForDay(table, rotationWeekOf(date), toDayIndex(date));
}

/** The seven PlanDays (Mon→Sun) for the week containing `date`. */
export function weekPlan(table: RotationTable, date: Date): PlanDay[] {
  const week = rotationWeekOf(date);
  return DAY_NAMES.map((_, i) => planForDay(table, week, i as DayIndex));
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
  if (plan.kind === "eat-out") return { emoji: "🍴", title: "Eating out", fa: "بیرون غذا می‌خوریم" };
  const category =
    plan.categoryId !== undefined ? findCategory(categories, plan.categoryId) : undefined;
  return {
    emoji: category?.emoji ?? "❓",
    title: category?.name_en ?? "Unknown",
    fa: category?.name_fa,
  };
}
