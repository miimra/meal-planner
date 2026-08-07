// app/lib/auth.ts
"use client";

import { useCallback, useSyncExternalStore } from "react";
// Uses an explicit .ts extension because this file (or its imports) may be
// reached by node:test, which — unlike Next's bundler — doesn't resolve
// extensionless specifiers.
import { pb } from "./pb.ts";

function subscribe(callback: () => void) {
  return pb.authStore.onChange(callback);
}

function getSnapshot() {
  return pb.authStore.isValid;
}

function getServerSnapshot() {
  return false;
}

export function useAuth() {
  const isLoggedIn = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const login = useCallback(async (email: string, password: string) => {
    await pb.collection("users").authWithPassword(email, password);
  }, []);

  const logout = useCallback(() => {
    pb.authStore.clear();
  }, []);

  return { isLoggedIn, login, logout };
}
