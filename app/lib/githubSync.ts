"use client";

import { pb } from "./pb.ts";

export type GithubSyncResult = {
  status: "completed" | "unchanged";
  commit: string;
  summary?: {
    recipesCreated?: number;
    recipesUpdated?: number;
    daysUpserted?: number;
  };
};

export function synchronizeGithubMeals() {
  // PocketBase's SDK adds the current users auth token to this request. The
  // server remains responsible for authorization and never exposes the
  // internal assistant credential to the browser.
  return pb.send<GithubSyncResult>("/api/internal/github-sync", {
    method: "POST",
    requestKey: null,
  });
}
