// app/lib/store.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { pb } from "./pb.ts";
import type { Category, Effort, Style } from "./categories.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Dish {
  id: string; // PocketBase record id
  categoryId: number; // matches Category.catId
  name: string;
  notes?: string;
  lastCooked?: string; // YYYY-MM-DD, kept locally (see readLastCooked below)
}

interface CategoryRecord {
  id: string;
  catId: number;
  name_en: string;
  name_fa: string;
  emoji: string;
  style: Style;
  effort: Effort;
  effort_min: number;
  effort_max: number;
  weekend_only?: boolean;
  prep_ahead?: boolean;
  notes?: string;
}

interface DishRecord {
  id: string;
  catId: number;
  name: string;
  notes?: string;
}

// ── PocketBase record → app-shape mapping (pure — see store.test.ts) ─────────

export function mapCategoryRecord(r: CategoryRecord): Category {
  return {
    pbId: r.id,
    catId: r.catId,
    name_en: r.name_en,
    name_fa: r.name_fa,
    emoji: r.emoji,
    style: r.style,
    effort: r.effort,
    effort_minutes: [r.effort_min, r.effort_max],
    weekend_only: r.weekend_only || undefined,
    prep_ahead: r.prep_ahead || undefined,
    notes: r.notes || undefined,
  };
}

export function mapDishRecord(r: DishRecord, lastCookedMap: Record<string, string>): Dish {
  return {
    id: r.id,
    categoryId: r.catId,
    name: r.name,
    notes: r.notes || undefined,
    lastCooked: lastCookedMap[r.id],
  };
}

// ── "Cooked today" — per-device only, never sent to PocketBase ───────────────
// ponytail: plain localStorage map, no server sync. Add a PocketBase field if
// tracking cook history across devices ever matters.

const LAST_COOKED_KEY = "mp_last_cooked_v1";

function readLastCooked(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LAST_COOKED_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeLastCooked(map: Record<string, string>) {
  window.localStorage.setItem(LAST_COOKED_KEY, JSON.stringify(map));
}

// ── Categories ───────────────────────────────────────────────────────────────

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const records = await pb
        .collection("categories")
        .getFullList<CategoryRecord>({ sort: "catId" });
      setCategories(records.map(mapCategoryRecord));
      setError(null);
    } catch {
      setError("Couldn't load categories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const update = useCallback(
    async (pbId: string, patch: Partial<Omit<Category, "pbId" | "catId">>) => {
      const { effort_minutes, ...rest } = patch;
      const body: Record<string, unknown> = { ...rest };
      if (effort_minutes) {
        body.effort_min = effort_minutes[0];
        body.effort_max = effort_minutes[1];
      }
      await pb.collection("categories").update(pbId, body);
      await refresh();
    },
    [refresh]
  );

  return { categories, loading, error, update };
}

// ── Dishes ───────────────────────────────────────────────────────────────────

export function useDishes() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const records = await pb.collection("dishes").getFullList<DishRecord>({ sort: "name" });
      const lastCookedMap = readLastCooked();
      setDishes(records.map((r) => mapDishRecord(r, lastCookedMap)));
      setError(null);
    } catch {
      setError("Couldn't load dishes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const forCategory = useCallback(
    (categoryId: number) => dishes.filter((d) => d.categoryId === categoryId),
    [dishes]
  );

  const add = useCallback(
    async (categoryId: number, name: string, notes?: string) => {
      await pb.collection("dishes").create({
        catId: categoryId,
        name: name.trim(),
        notes: notes?.trim() || undefined,
      });
      await refresh();
    },
    [refresh]
  );

  const update = useCallback(
    async (id: string, patch: { name?: string; notes?: string }) => {
      await pb.collection("dishes").update(id, patch);
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      await pb.collection("dishes").delete(id);
      await refresh();
    },
    [refresh]
  );

  const markCooked = useCallback((id: string, key: string) => {
    const map = readLastCooked();
    if (map[id] === key) {
      delete map[id];
    } else {
      map[id] = key;
    }
    writeLastCooked(map);
    setDishes((prev) => prev.map((d) => (d.id === id ? { ...d, lastCooked: map[id] } : d)));
  }, []);

  return { dishes, loading, error, forCategory, add, update, remove, markCooked };
}
