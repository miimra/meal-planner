// app/dishes/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { Category, EFFORT_LABEL, Effort, STYLE_LABEL, Style } from "../lib/categories";
import { Dish, useCategories, useDishes } from "../lib/store";

function isPersian(s: string) {
  return /[؀-ۿ]/.test(s.trim().charAt(0));
}

export default function DishesPage() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const { isLoggedIn } = useAuth();
  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
    update: updateCategory,
  } = useCategories();
  const dishStore = useDishes();
  useEffect(() => setMounted(true), []);

  if (!mounted || categoriesLoading) {
    return <div className="h-96 animate-pulse rounded-3xl bg-bg-elevated" />;
  }

  if (categoriesError || dishStore.error) {
    return <p className="text-sm text-ink-faint">Couldn't load — check your connection.</p>;
  }

  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-bold">Your dishes</h1>
        <p className="text-sm text-ink-faint">
          {isLoggedIn ? "Tap a category to edit its dishes" : "Tap a category to see its dishes"}
        </p>
      </header>

      <div className="flex flex-col gap-2.5">
        {categories.map((cat) => {
          const dishes = dishStore.forCategory(cat.catId);
          const isOpen = open === cat.catId;
          return (
            <section
              key={cat.catId}
              className="overflow-hidden rounded-2xl bg-bg-elevated"
              style={{ boxShadow: "var(--shadow)" }}
            >
              <button
                onClick={() => setOpen(isOpen ? null : cat.catId)}
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
                <span className="flex-none text-sm text-ink-faint">{dishes.length}</span>
                <span
                  className="flex-none text-ink-faint transition-transform"
                  style={{ transform: isOpen ? "rotate(90deg)" : "none" }}
                >
                  ›
                </span>
              </button>

              {isOpen && (
                <CategoryEditor
                  category={cat}
                  dishes={dishes}
                  dishStore={dishStore}
                  isLoggedIn={isLoggedIn}
                  onUpdateCategory={updateCategory}
                />
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}

function CategoryEditor({
  category,
  dishes,
  dishStore,
  isLoggedIn,
  onUpdateCategory,
}: {
  category: Category;
  dishes: Dish[];
  dishStore: ReturnType<typeof useDishes>;
  isLoggedIn: boolean;
  onUpdateCategory: (
    pbId: string,
    patch: Partial<Omit<Category, "pbId" | "catId">>
  ) => Promise<void>;
}) {
  const [adding, setAdding] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState(false);

  return (
    <div className="border-t border-line px-4 pb-4 pt-2">
      {isLoggedIn && (
        <div className="flex justify-end pb-2">
          <button
            onClick={() => setEditingCategory((v) => !v)}
            className="text-xs text-accent underline underline-offset-2"
          >
            {editingCategory ? "Done" : "Edit category"}
          </button>
        </div>
      )}

      {editingCategory && (
        <CategoryFieldsEditor
          category={category}
          onUpdate={onUpdateCategory}
          onSave={() => setEditingCategory(false)}
        />
      )}

      {dishes.length === 0 && (
        <p className="py-2 text-sm text-ink-faint">
          {isLoggedIn ? "No dishes yet — add one below." : "No dishes yet."}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-line">
        {dishes.map((dish) =>
          editingId === dish.id ? (
            <DishEdit
              key={dish.id}
              dish={dish}
              onSave={(name, notes) => {
                dishStore
                  .update(dish.id, { name, notes })
                  .catch(() => alert("Couldn't save — try again."));
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <li key={dish.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${isPersian(dish.name) ? "fa" : ""}`}>{dish.name}</p>
                {dish.notes && <p className="truncate text-xs text-ink-faint">{dish.notes}</p>}
                {dish.lastCooked && (
                  <p className="text-xs text-ink-faint">Last cooked {dish.lastCooked}</p>
                )}
              </div>
              {isLoggedIn && (
                <>
                  <button
                    onClick={() => setEditingId(dish.id)}
                    className="flex-none rounded-lg px-2 py-1 text-xs text-accent"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${dish.name}"?`))
                        dishStore.remove(dish.id).catch(() => alert("Couldn't save — try again."));
                    }}
                    className="flex-none rounded-lg px-2 py-1 text-xs text-ink-faint"
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          )
        )}
      </ul>

      {isLoggedIn && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (adding.trim()) {
              dishStore
                .add(category.catId, adding)
                .catch(() => alert("Couldn't save — try again."));
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
      )}
    </div>
  );
}

const STYLE_OPTIONS: Style[] = ["iranian", "international", "either"];
const EFFORT_OPTIONS: Effort[] = ["quick", "medium", "medium-heavy", "heavy"];

function CategoryFieldsEditor({
  category,
  onUpdate,
  onSave,
}: {
  category: Category;
  onUpdate: (
    pbId: string,
    patch: Partial<Omit<Category, "pbId" | "catId">>
  ) => Promise<void>;
  onSave: () => void;
}) {
  const [nameEn, setNameEn] = useState(category.name_en);
  const [nameFa, setNameFa] = useState(category.name_fa);
  const [emoji, setEmoji] = useState(category.emoji);
  const [style, setStyle] = useState<Style>(category.style);
  const [effort, setEffort] = useState<Effort>(category.effort);
  const [effortMin, setEffortMin] = useState(String(category.effort_minutes[0]));
  const [effortMax, setEffortMax] = useState(String(category.effort_minutes[1]));
  const [weekendOnly, setWeekendOnly] = useState(!!category.weekend_only);
  const [prepAhead, setPrepAhead] = useState(!!category.prep_ahead);
  const [notes, setNotes] = useState(category.notes ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await onUpdate(category.pbId, {
            name_en: nameEn.trim(),
            name_fa: nameFa.trim(),
            emoji: emoji.trim(),
            style,
            effort,
            effort_minutes: [Number(effortMin) || 0, Number(effortMax) || 0],
            weekend_only: weekendOnly,
            prep_ahead: prepAhead,
            notes: notes.trim(),
          });
          onSave();
        } catch {
          alert("Couldn't save — try again.");
        } finally {
          setSaving(false);
        }
      }}
      className="mb-3 flex flex-col gap-2 rounded-xl border border-line p-3"
    >
      <div className="flex gap-2">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          className="w-16 rounded-xl border border-line bg-bg px-3 py-2 text-center text-lg outline-none focus:border-accent"
          placeholder="🍽️"
        />
        <input
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="English name"
        />
      </div>
      <input
        value={nameFa}
        onChange={(e) => setNameFa(e.target.value)}
        className="fa rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        placeholder="Persian name"
      />
      <div className="flex gap-2">
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value as Style)}
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {STYLE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STYLE_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={effort}
          onChange={(e) => setEffort(e.target.value as Effort)}
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {EFFORT_OPTIONS.map((ef) => (
            <option key={ef} value={ef}>
              {EFFORT_LABEL[ef]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={effortMin}
          onChange={(e) => setEffortMin(e.target.value)}
          className="w-20 rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <span className="text-sm text-ink-faint">–</span>
        <input
          type="number"
          value={effortMax}
          onChange={(e) => setEffortMax(e.target.value)}
          className="w-20 rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <span className="text-sm text-ink-faint">min</span>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={weekendOnly}
          onChange={(e) => setWeekendOnly(e.target.checked)}
        />
        Weekend only
      </label>
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={prepAhead}
          onChange={(e) => setPrepAhead(e.target.checked)}
        />
        Prep ahead
      </label>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        placeholder="Notes (optional)"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save category"}
      </button>
    </form>
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
