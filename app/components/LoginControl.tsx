// app/components/LoginControl.tsx
"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth";

export default function LoginControl() {
  const { isLoggedIn, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isLoggedIn) {
    return (
      <button
        onClick={() => {
          if (confirm("Log out?")) logout();
        }}
        aria-label="Log out"
        className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
        style={{ background: "var(--bg-elevated)", boxShadow: "var(--shadow-sm)" }}
      >
        🔓
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Log in"
        className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
        style={{ background: "var(--bg-elevated)", boxShadow: "var(--shadow-sm)" }}
      >
        🔒
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            setError(null);
            try {
              await login(email, password);
              setOpen(false);
              setPassword("");
            } catch {
              setError("Wrong email or password.");
            } finally {
              setSubmitting(false);
            }
          }}
          className="absolute right-0 bottom-full z-30 mb-2 flex w-56 flex-col gap-2 rounded-2xl p-3"
          style={{ background: "var(--bg-elevated)", boxShadow: "var(--shadow)" }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>
      )}
    </div>
  );
}
