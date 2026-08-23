import PocketBase from "pocketbase";

// Same-origin in production (PocketBase serves the app itself — see
// Dockerfile). NEXT_PUBLIC_PB_URL overrides this for local `next dev`,
// where the frontend and PocketBase run as separate processes.
const baseUrl =
  process.env.NEXT_PUBLIC_PB_URL ??
  (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8090");

export const pb = new PocketBase(baseUrl);
