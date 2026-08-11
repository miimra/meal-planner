// app/components/LoginControl.tsx
"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth";
import { synchronizeGithubMeals } from "../lib/githubSync";

export default function LoginControl() {
  const { isLoggedIn, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  if (isLoggedIn) {
    return (
      <div className="relative">
        <button
          onClick={() => {
            setOpen((value) => !value);
            setSyncMessage(null);
          }}
          aria-label="Open account actions"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
          style={{ background: "var(--bg-elevated)", boxShadow: "var(--shadow-sm)" }}
        >
          🔓
        </button>
        {open && (
          <div
            className="absolute right-0 bottom-full z-30 mb-2 flex w-56 flex-col gap-2 rounded-2xl p-3"
            style={{ background: "var(--bg-elevated)", boxShadow: "var(--shadow)" }}
          >
            <button
              type="button"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                setSyncMessage(null);
                try {
                  const result = await synchronizeGithubMeals();
                  setSyncMessage(
                    result.status === "unchanged"
                      ? "Meals are already up to date."
                      : "Meals synchronized successfully."
                  );
                } catch {
                  setSyncMessage("Synchronization failed. Please try again.");
                } finally {
                  setSyncing(false);
                }
              }}
              className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {syncing ? "Synchronizing…" : "↻ Synchronize meals"}
            </button>
            {syncMessage && (
              <p className="text-xs text-ink-soft" role="status" aria-live="polite">
                {syncMessage}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                if (confirm("Log out?")) {
                  setOpen(false);
                  logout();
                }
              }}
              className="rounded-xl border border-line px-3 py-2 text-sm text-ink-soft"
            >
              Log out
            </button>
          </div>
        )}
      </div>
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
