"use strict";

const { ToolError } = require("./errors.js");

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Validates a YYYY-MM-DD calendar date (in APP_TIMEZONE) and returns it.
function requireDate(value, name) {
  const label = name || "date";
  const match = typeof value === "string" ? DATE_PATTERN.exec(value) : null;
  if (match) {
    const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) return value;
  }
  throw new ToolError(`${label} must be a real calendar date in YYYY-MM-DD format`, "invalid_params");
}

function typeOk(type, value) {
  if (Array.isArray(type)) return type.some(function (t) { return t === "null" ? value === null : typeOk(t, value); });
  if (type === "null") return value === null;
  if (type === "string") return typeof value === "string";
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number" && isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return true;
}

// Minimal JSON Schema check (object schemas with flat properties): required,
// additionalProperties, type and enum. Throws ToolError with a plain message.
function validateArgs(schema, args) {
  if (args === undefined || args === null) args = {};
  if (typeof args !== "object" || Array.isArray(args)) throw new ToolError("arguments must be an object", "invalid_params");
  const props = (schema && schema.properties) || {};
  for (const key of (schema && schema.required) || []) {
    if (!Object.prototype.hasOwnProperty.call(args, key) || args[key] === undefined) {
      throw new ToolError(`${key} is required`, "invalid_params");
    }
  }
  for (const key of Object.keys(args)) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) {
      throw new ToolError(`unknown argument ${key.slice(0, 40)}`, "invalid_params");
    }
    const def = props[key];
    if (def.type && !typeOk(def.type, args[key])) throw new ToolError(`${key} must be of type ${[].concat(def.type).join(" or ")}`, "invalid_params");
    if (def.enum && def.enum.indexOf(args[key]) === -1) throw new ToolError(`${key} must be one of: ${def.enum.join(", ")}`, "invalid_params");
  }
  return args;
}

module.exports = { requireDate, validateArgs };
