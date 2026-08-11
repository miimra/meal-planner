// app/lib/categories.ts
// The 12 fixed categories. Their content lives in PocketBase (see the
// `categories` collection in pb_migrations/); this file only keeps the shared
// TypeScript shape and static UI labels.

export type Style = "iranian" | "international" | "either";
export type Effort = "quick" | "medium" | "medium-heavy" | "heavy";

export interface Category {
  /** PocketBase record id used by meal assignment relations. */
  pbId: string;
  /** Stable 1–12 id. `rotation.ts`'s day tables reference categories by this. */
  catId: number;
  name_fa: string;
  name_en: string;
  emoji: string;
  style: Style;
  effort: Effort;
  effort_minutes: [number, number];
  weekend_only?: boolean;
  prep_ahead?: boolean;
  notes?: string;
}

export function findCategory(categories: Category[], catId: number): Category | undefined {
  return categories.find((c) => c.catId === catId);
}

export const EFFORT_LABEL: Record<Effort, string> = {
  quick: "Quick",
  medium: "Medium",
  "medium-heavy": "Medium–Heavy",
  heavy: "Heavy",
};

export const STYLE_LABEL: Record<Style, string> = {
  iranian: "Iranian",
  international: "International",
  either: "Either",
};
