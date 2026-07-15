"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "../lib/categories";
import { Dish, useDishes } from "../lib/store";
import { StyleBadge } from "../components/badges";

function isPersian(s: string) {
  return /[؀-ۿ]/.test(s.trim().charAt(0));
}

export default function DishesPage() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const store = useDishes();
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-96 animate-pulse rounded-3xl bg-bg-elevated" />;
  }

  return (
    <main className="flex flex-col gap-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">Your dishes</h1>
          <p className="text-sm text-ink-faint">Tap a category to edit its dishes</p>
        </div>
        <button
          onClick={() => {
            if (confirm("Reset all dishes back to the original list?")) {
              store.resetToDefaults();
            }
          }}
          className="text-xs text-ink-faint underline underline-offset-2"
        >
          Reset
        </button>
      </header>

      <div className="flex flex-col gap-2.5">
        {CATEGORIES.map((cat) => {
          const dishes = store.forCategory(cat.id);
          const isOpen = open === cat.id;
          return (
            <section
              key={cat.id}
              className="overflow-hidden rounded-2xl bg-bg-elevated"
              style={{ boxShadow: "var(--shadow)" }}
            >
              <button
                onClick={() => setOpen(isOpen ? null : cat.id)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span className="text-2xl">{cat.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{cat.name_en}</p>
                    {cat.weekend_only && (
                      <span className="flex-none text-xs text-ink-faint">weekend</span>
                    )}
                  </div>
                  <p className="fa truncate text-sm text-ink-soft">{cat.name_fa}</p>
                </div>
                <span className="flex-none text-sm text-ink-faint">
                  {dishes.length}
                </span>
                <span
                  className="flex-none text-ink-faint transition-transform"
                  style={{ transform: isOpen ? "rotate(90deg)" : "none" }}
                >
                  ›
                </span>
              </button>

              {isOpen && (
                <CategoryEditor categoryId={cat.id} dishes={dishes} store={store} />
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}

function CategoryEditor({
  categoryId,
  dishes,
  store,
}: {
  categoryId: number;
  dishes: Dish[];
  store: ReturnType<typeof useDishes>;
}) {
  const [adding, setAdding] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="border-t border-line px-4 pb-4 pt-2">
      {dishes.length === 0 && (
        <p className="py-2 text-sm text-ink-faint">No dishes yet — add one below.</p>
      )}

      <ul className="flex flex-col divide-y divide-line">
        {dishes.map((dish) =>
          editingId === dish.id ? (
            <DishEdit
              key={dish.id}
              dish={dish}
              onSave={(name, notes) => {
                store.update(dish.id, { name, notes: notes || undefined });
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <li key={dish.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${isPersian(dish.name) ? "fa" : ""}`}>
                  {dish.name}
                </p>
                {dish.notes && (
                  <p className="truncate text-xs text-ink-faint">{dish.notes}</p>
                )}
                {dish.lastCooked && (
                  <p className="text-xs text-ink-faint">
                    Last cooked {dish.lastCooked}
                  </p>
                )}
              </div>
              <button
                onClick={() => setEditingId(dish.id)}
                className="flex-none rounded-lg px-2 py-1 text-xs text-accent"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${dish.name}"?`)) store.remove(dish.id);
                }}
                className="flex-none rounded-lg px-2 py-1 text-xs text-ink-faint"
              >
                Delete
              </button>
            </li>
          )
        )}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (adding.trim()) {
            store.add(categoryId, adding);
            setAdding("");
          }
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="Add a dish…"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!adding.trim()}
          className="flex-none rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Add
        </button>
      </form>
    </div>
  );
}

function DishEdit({
  dish,
  onSave,
  onCancel,
}: {
  dish: Dish;
  onSave: (name: string, notes: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(dish.name);
  const [notes, setNotes] = useState(dish.notes ?? "");

  return (
    <li className="flex flex-col gap-2 py-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent ${
          isPersian(name) ? "fa" : ""
        }`}
        placeholder="Dish name"
      />
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        placeholder="Notes (optional)"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-ink-faint">
          Cancel
        </button>
        <button
          onClick={() => name.trim() && onSave(name.trim(), notes.trim())}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
        >
          Save
        </button>
      </div>
    </li>
  );
}
