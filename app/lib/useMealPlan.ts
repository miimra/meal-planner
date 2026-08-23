"use client";

import { useCallback, useEffect, useState } from "react";
import { pb } from "./pb.ts";
import type { Category } from "./categories.ts";
import type { AssignmentRecord, PlanDish } from "./plan.ts";

interface CategoryRecord {
  id: string;
  catId: number;
  name_en: string;
  name_fa: string;
  emoji: string;
  style: "iranian" | "international" | "either";
  effort: "quick" | "medium" | "medium-heavy" | "heavy";
  effort_min: number;
  effort_max: number;
  weekend_only?: boolean;
  prep_ahead?: boolean;
  notes?: string;
}

interface DishRecord {
  id: string;
  name: string;
}

function mapCategoryRecord(record: CategoryRecord): Category {
  return {
    pbId: record.id,
    catId: record.catId,
    name_en: record.name_en,
    name_fa: record.name_fa,
    emoji: record.emoji,
    style: record.style,
    effort: record.effort,
    effort_minutes: [record.effort_min, record.effort_max],
    weekend_only: record.weekend_only || undefined,
    prep_ahead: record.prep_ahead || undefined,
    notes: record.notes || undefined,
  };
}

export function useMealPlan(start: string, end: string) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [dishes, setDishes] = useState<PlanDish[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [categoryRecords, dishRecords, assignmentRecords] = await Promise.all([
        pb.collection("categories").getFullList<CategoryRecord>({ sort: "catId" }),
        pb.collection("dishes").getFullList<DishRecord>({ sort: "name" }),
        pb.collection("meal_assignments").getFullList<AssignmentRecord>({
          filter: pb.filter("date >= {:start} && date <= {:end}", { start, end }),
          sort: "date,meal",
        }),
      ]);
      setCategories(categoryRecords.map(mapCategoryRecord));
      setDishes(dishRecords.map((record) => ({ id: record.id, name: record.name })));
      setAssignments(assignmentRecords);
      setError(null);
    } catch {
      setError("Couldn’t load the meal plan.");
    } finally {
      setLoading(false);
    }
  }, [end, start]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { assignments, categories, dishes, error, loading, refresh };
}
