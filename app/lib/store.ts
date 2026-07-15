"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { CATEGORIES } from "./categories";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Dish {
  id: string;
  categoryId: number;
  name: string;
  notes?: string;
  lastCooked?: string; // YYYY-MM-DD
}

const DISHES_KEY = "mp_dishes_v1";

// ── Seeding ──────────────────────────────────────────────────────────────────

function seedDishes(): Dish[] {
  const out: Dish[] = [];
  for (const cat of CATEGORIES) {
    for (const name of cat.dishes) {
      out.push({ id: newId(), categoryId: cat.id, name });
    }
  }
  return out;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── Persistence ──────────────────────────────────────────────────────────────

function read(): Dish[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DISHES_KEY);
    if (!raw) {
      const seeded = seedDishes();
      window.localStorage.setItem(DISHES_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw) as Dish[];
  } catch {
    return [];
  }
}

function write(dishes: Dish[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISHES_KEY, JSON.stringify(dishes));
  emit();
}

// ── Minimal external store so all screens stay in sync ────────────────────────

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === DISHES_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

// Cache so getSnapshot returns a stable reference between writes.
let cache: Dish[] | null = null;
let cacheRaw: string | null = null;

function getSnapshot(): Dish[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(DISHES_KEY);
  if (raw === null) {
    const seeded = read(); // seeds + persists
    cache = seeded;
    cacheRaw = window.localStorage.getItem(DISHES_KEY);
    return cache;
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = JSON.parse(raw) as Dish[];
  }
  return cache!;
}

const EMPTY: Dish[] = [];
function getServerSnapshot(): Dish[] {
  return EMPTY;
}

// ── Public hook ──────────────────────────────────────────────────────────────

export function useDishes() {
  const dishes = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Ensure seeding happens on first client mount even if nothing subscribed yet.
  useEffect(() => {
    read();
  }, []);

  const all = useCallback(() => read(), []);

  const forCategory = useCallback(
    (categoryId: number) => dishes.filter((d) => d.categoryId === categoryId),
    [dishes]
  );

  const add = useCallback((categoryId: number, name: string, notes?: string) => {
    const dishes = read();
    dishes.push({ id: newId(), categoryId, name: name.trim(), notes: notes?.trim() || undefined });
    write(dishes);
  }, []);

  const update = useCallback((id: string, patch: Partial<Omit<Dish, "id">>) => {
    const dishes = read().map((d) => (d.id === id ? { ...d, ...patch } : d));
    write(dishes);
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter((d) => d.id !== id));
  }, []);

  const markCooked = useCallback((id: string, dateKey: string) => {
    const dishes = read().map((d) =>
      d.id === id ? { ...d, lastCooked: d.lastCooked === dateKey ? undefined : dateKey } : d
    );
    write(dishes);
  }, []);

  const resetToDefaults = useCallback(() => {
    write(seedDishes());
  }, []);

  return { dishes, all, forCategory, add, update, remove, markCooked, resetToDefaults };
}
