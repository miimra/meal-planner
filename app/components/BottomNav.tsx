"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LoginControl from "./LoginControl";

function TodayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 4.5V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="12.5" r="1.4" fill="currentColor" />
    </svg>
  );
}
function WeekIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      {[6, 12, 18].map((y) => (
        <path key={y} d={`M5 ${y}H19`} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ))}
    </svg>
  );
}
function RotationIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {[8, 16].map((x) =>
        [8, 16].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.9" />)
      )}
    </svg>
  );
}
function DishesIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="6" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 12H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const TABS = [
  { href: "/", label: "Today", Icon: TodayIcon },
  { href: "/week", label: "Week", Icon: WeekIcon },
  { href: "/rotation", label: "Rotation", Icon: RotationIcon },
  { href: "/dishes", label: "Dishes", Icon: DishesIcon },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line pb-safe pt-1.5 backdrop-blur-md"
      style={{ background: "var(--nav-bg)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch px-2">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className="flex flex-col items-center gap-1 py-1.5 text-xs transition-colors"
                style={{ color: active ? "var(--accent)" : "var(--ink-faint)" }}
              >
                <span
                  className="flex h-9 w-14 items-center justify-center rounded-full transition-colors"
                  style={{ background: active ? "var(--accent-soft)" : "transparent" }}
                >
                  <Icon />
                </span>
                <span className={active ? "font-semibold" : ""}>{label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex flex-none items-center justify-center pl-1">
          <LoginControl />
        </li>
      </ul>
    </nav>
  );
}
