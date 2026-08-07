import { Category, EFFORT_LABEL } from "@/app/lib/categories";
import { effortRange } from "@/app/lib/rotation";

const EFFORT_ICON: Record<Category["effort"], string> = {
  quick: "⚡",
  medium: "🕒",
  "medium-heavy": "🕓",
  heavy: "🔥",
};

/** Warm clay pill: "🕒 Medium · 30–45 min". */
export function EffortBadge({ category }: { category: Category }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-clay-soft px-3 py-1.5 text-sm font-semibold text-clay-ink">
      <span>{EFFORT_ICON[category.effort]}</span>
      <span>{EFFORT_LABEL[category.effort]}</span>
      <span className="opacity-50">·</span>
      <span>{effortRange(category)}</span>
    </span>
  );
}

/** Small clay pill used for "Week 1" etc. */
export function ClayPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-clay-soft px-3 py-1 text-sm font-bold text-clay-ink">
      {children}
    </span>
  );
}

/** Rounded emoji tile with a soft clay background, as in the hero card. */
export function EmojiTile({
  emoji,
  size = "lg",
}: {
  emoji: string;
  size?: "lg" | "sm";
}) {
  const dim = size === "lg" ? "h-20 w-20 text-4xl rounded-3xl" : "h-12 w-12 text-2xl rounded-2xl";
  return (
    <span
      className={`flex flex-none items-center justify-center border border-clay-soft bg-clay-soft ${dim}`}
    >
      {emoji}
    </span>
  );
}
