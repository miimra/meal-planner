import type { Category } from "./categories.ts";
import { findCategory } from "./categories.ts";
import { planForDate } from "./rotation.ts";

// Dinner is the only meal the plan covers. Older breakfast and lunch rows stay
// in PocketBase, so the stored type stays wider than what we render.
export const MEALS = ["dinner"] as const;
export type PlannedMeal = (typeof MEALS)[number];
export type MealType = "breakfast" | "lunch" | "dinner";
export type MealStatus =
  | "unplanned"
  | "planned"
  | "cooked"
  | "skipped"
  | "leftovers"
  | "buy_food"
  | "eating_out";

export interface PlanDish {
  id: string;
  name: string;
}

export interface AssignmentRecord {
  id: string;
  date: string;
  meal: MealType;
  category?: string;
  dish?: string;
  status?: MealStatus | "";
  selection_source?: "ai" | "last_meal" | "telegram" | "";
}

export interface MealSlot {
  meal: MealType;
  status: MealStatus;
  category: Category | null;
  categoryOptions: Category[];
  dish: PlanDish | null;
  selectionSource: AssignmentRecord["selection_source"] | null;
}

export interface PlanDay {
  date: string;
  meals: Record<PlannedMeal, MealSlot>;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dateFromKey(value: string): Date {
  const match = DATE.exec(value);
  if (!match) throw new Error("Invalid date key");
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

export function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function addDateDays(value: string, count: number): string {
  const match = DATE.exec(value);
  if (!match) throw new Error("Invalid date key");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + count));
  return date.toISOString().slice(0, 10);
}

export function mondayKey(value: string): string {
  const date = dateFromKey(value);
  const mondayIndex = (date.getDay() + 6) % 7;
  return addDateDays(value, -mondayIndex);
}

export function amsterdamToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

const MEAL_CUTOFF_MINUTES: Record<MealType, number> = {
  breakfast: 12 * 60,
  lunch: 15 * 60,
  dinner: 21 * 60,
};

export function amsterdamMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

export function mealHasPassed(date: string, meal: MealType, now = new Date()): boolean {
  const today = amsterdamToday(now);
  if (date < today) return true;
  if (date > today) return false;
  return amsterdamMinutes(now) >= MEAL_CUTOFF_MINUTES[meal];
}

export function dayLabel(value: string, style: "long" | "short" = "long"): string {
  return dateFromKey(value).toLocaleDateString("en-GB", {
    weekday: style,
    day: "numeric",
    month: style,
  });
}

export function buildDay(
  date: string,
  categories: Category[],
  dishes: PlanDish[],
  assignments: AssignmentRecord[],
): PlanDay {
  const assignmentMap = new Map(
    assignments.filter((item) => item.date === date).map((item) => [item.meal, item]),
  );
  const categoryByRecordId = new Map(categories.map((item) => [item.pbId, item]));
  const dishById = new Map(dishes.map((item) => [item.id, item]));
  const rotation = planForDate(dateFromKey(date));
  const meals = {} as Record<PlannedMeal, MealSlot>;

  for (const meal of MEALS) {
    const assignment = assignmentMap.get(meal);
    let category = assignment?.category ? categoryByRecordId.get(assignment.category) ?? null : null;
    if (!category && meal === "dinner" && rotation.categoryId !== undefined) {
      category = findCategory(categories, rotation.categoryId) ?? null;
    }
    const categoryOptions = meal !== "dinner"
      ? []
      : rotation.choiceIds
        ? rotation.choiceIds.map((catId) => findCategory(categories, catId)).filter((item): item is Category => Boolean(item))
        : category ? [category] : [];
    const dish = assignment?.dish ? dishById.get(assignment.dish) ?? null : null;
    let status: MealStatus = assignment?.status || (dish ? "planned" : "unplanned");
    if (!assignment && meal === "dinner" && rotation.kind === "eat-out") status = "eating_out";
    meals[meal] = {
      meal,
      status,
      category,
      categoryOptions,
      dish,
      selectionSource: assignment?.selection_source || null,
    };
  }

  return { date, meals };
}
