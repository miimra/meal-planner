// app/lib/auth.ts
"use client";

import { useCallback, useSyncExternalStore } from "react";
import { pb } from "./pb";

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
