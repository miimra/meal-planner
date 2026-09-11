"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A plate on the sofreh — one setting, for today. */
function TodayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

/** Seven bars — the same shape as the week strip on the Week screen. */
function WeekIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      {[
        [3.5, 9],
        [6.9, 6.5],
        [10.3, 10.5],
        [13.7, 5],
        [17.1, 8],
        [20.5, 11],
      ].map(([x, top]) => (
        <path
          key={x}
          d={`M${x} ${top}V19`}
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/** A two-by-two of tiles — the rotation laid out as a grid of themes. */
function CategoriesIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      {[
        [4, 4],
        [13.5, 4],
        [4, 13.5],
        [13.5, 13.5],
      ].map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="6.5"
          height="6.5"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      ))}
    </svg>
  );
}

const TABS = [
  { href: "/", label: "Today", Icon: TodayIcon },
  { href: "/week", label: "Week", Icon: WeekIcon },
  { href: "/categories", label: "Categories", Icon: CategoriesIcon },
];

export default function BottomNav() {
  const pathname = usePathname();
  const activeIndex = Math.max(
    0,
    TABS.findIndex(({ href }) => (href === "/" ? pathname === "/" : pathname.startsWith(href))),
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 pb-safe pt-2 backdrop-blur-xl"
      style={{
        background: "var(--nav-bg)",
        borderTop: "1px solid var(--line)",
        boxShadow: "0 -8px 30px rgba(10, 20, 30, 0.06)",
      }}
    >
      <ul className="relative mx-auto flex max-w-lg items-stretch px-3">
        {/* One pill that slides between tabs, rather than two that blink. */}
        <li
          className="pointer-events-none absolute bottom-1 top-0 left-3 rounded-2xl"
          style={{
            width: `calc((100% - 1.5rem) / ${TABS.length})`,
            transform: `translateX(${activeIndex * 100}%)`,
            transition: "transform 0.5s cubic-bezier(0.34, 1.4, 0.5, 1)",
            background: "var(--saffron-soft)",
          }}
          aria-hidden
        />
        {TABS.map(({ href, label, Icon }, index) => {
          const active = index === activeIndex;
          return (
            <li key={href} className="relative flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center gap-1 rounded-2xl py-2 text-[0.6875rem] font-bold"
                style={{
                  color: active ? "var(--saffron-ink)" : "var(--ink-faint)",
                  transition: "color 0.35s ease",
                }}
              >
                <span
                  className="flex items-center justify-center"
                  style={{
                    transform: active ? "translateY(-1px) scale(1.08)" : "none",
                    transition: "transform 0.5s cubic-bezier(0.34, 1.6, 0.5, 1)",
                  }}
                >
                  <Icon />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
