"use strict";

const RECIPE_ID = "[a-z0-9]+(?:-[a-z0-9]+)*";

function normalizeRoot(value) {
  const root = String(value || "meal-data").replace(/^\/+|\/+$/g, "");
  if (!root || root.split("/").some((part) => part === "." || part === ".." || !part)) {
    throw new Error("MEAL_DATA_GITHUB_ROOT must be a safe repository-relative path");
  }
  return root;
}

function classifyPath(filename, configuredRoot) {
  const root = normalizeRoot(configuredRoot);
  if (filename === `${root}/household.json`) return { kind: "household" };
  if (filename.startsWith(`${root}/schema/`)) return { kind: "schema" };

  let match = new RegExp(`^${escapeRegExp(root)}/recipes/(${RECIPE_ID})\\.json$`).exec(filename);
  if (match) return { kind: "recipe", recipeId: match[1] };

  match = new RegExp(
    `^${escapeRegExp(root)}/days/(\\d{4})/(\\d{2})/(\\d{4}-\\d{2}-\\d{2})/day\\.json$`,
  ).exec(filename);
  if (match) return { kind: "day", year: match[1], month: match[2], date: match[3] };
  return { kind: "ignored" };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertPathMatches(classification, data, filename) {
  if (classification.kind === "recipe" && data.id !== classification.recipeId) {
    throw pathError(filename, `recipe id ${data.id} does not match its filename`);
  }
  if (classification.kind === "day") {
    if (data.date !== classification.date) {
      throw pathError(filename, `day date ${data.date} does not match its folder`);
    }
    if (data.date.slice(0, 4) !== classification.year || data.date.slice(5, 7) !== classification.month) {
      throw pathError(filename, `day date ${data.date} does not match its year/month folders`);
    }
  }
}

function pathError(filename, message) {
  const error = new Error(`Invalid source path ${filename}: ${message}`);
  error.name = "SchemaValidationError";
  error.status = 422;
  return error;
}

module.exports = { assertPathMatches, classifyPath, normalizeRoot };
