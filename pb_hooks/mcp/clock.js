"use strict";

// Local "now" in APP_TIMEZONE as { date: YYYY-MM-DD, time: HH:MM, timezone }.
// Runs inside PocketBase (DateTime/Timezone globals); tests replace localNow.
function localNow() {
  const timezone = String($os.getenv("APP_TIMEZONE") || "Europe/Amsterdam");
  const now = new DateTime().time().in(new Timezone(timezone));
  return { date: now.format("2006-01-02"), time: now.format("15:04"), timezone: timezone };
}

module.exports = { localNow };
