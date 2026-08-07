import { Category, EFFORT_LABEL } from "@/app/lib/categories";
import { effortRange } from "@/app/lib/rotation";

const EFFORT_ICON: Record<Category["effort"], string> = {
  quick: "⚡",
  medium: "🕒",
  "medium-heavy": "🕓",
  heavy: "🔥",
};

/** Sunny peach pill: "🕒 Medium · 30–45 min". */
export function EffortBadge({ category }: { category: Category }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-clay-soft px-3.5 py-1.5 text-sm font-bold text-clay-ink">
      <span>{EFFORT_ICON[category.effort]}</span>
      <span>{EFFORT_LABEL[category.effort]}</span>
      <span className="opacity-50">·</span>
      <span>{effortRange(category)}</span>
    </span>
  );
}

/** Small peach pill used for "Week 1" etc. */
export function ClayPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-clay-soft px-3.5 py-1.5 text-sm font-extrabold text-clay-ink">
      {children}
    </span>
  );
}

/** Dreamy glowing emoji tile — the emotional anchor of each category card. */
export function EmojiTile({
  emoji,
  size = "lg",
  bob = true,
}: {
  emoji: string;
  size?: "lg" | "sm";
  bob?: boolean;
}) {
  const dim =
    size === "lg"
      ? "h-20 w-20 text-4xl rounded-[26px]"
      : "h-12 w-12 text-2xl rounded-2xl";
  return (
    <span
      className={`relative flex flex-none items-center justify-center ${dim}`}
      style={{
        background:
          "linear-gradient(150deg, var(--accent-soft), var(--clay-soft))",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.5), 0 8px 20px rgba(207, 79, 166, 0.22)",
      }}
    >
      <span className={bob ? "animate-bob" : ""}>{emoji}</span>
    </span>
  );
}
