"use strict";

const page = require(`${typeof __hooks === "undefined" ? "." : __hooks + "/recipe_import"}/page.js`);

function parseSource(html, url) {
  const result = page.parsePage(html, url);
  result.sourcePlatform = "instagram";
  // Instagram's public HTML varies by login/region. OpenGraph values are the
  // stable best-effort interface; absence is handled by the confirmation flow.
  return result;
}

module.exports = { parseSource };
