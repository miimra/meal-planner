"use strict";

const { ToolError } = require("./errors.js");

const MAX_TEXT = 200;

function clean(value) {
  return String(value === undefined || value === null ? "" : value).replace(/[\r\n\t]+/g, " ").slice(0, MAX_TEXT);
}

// One audit line per mutating call: tool, record id and outcome. Free text
// (ids and error messages) is single-line and capped at 200 characters.
function logAction(tool, id, result) {
  console.log(`MCP action: ${tool} ${clean(id) || "-"} -> ${clean(result)}`);
}

// Runs a mutating service call. Domain errors (error.domain) become ToolErrors;
// both outcomes are logged. `describe(value)` returns { id, result } on success.
function runAction(tool, requestedId, run, describe) {
  let value;
  try {
    value = run();
  } catch (error) {
    if (error && error.domain) {
      logAction(tool, requestedId, `error ${error.code}: ${error.message}`);
      throw new ToolError(error.message, error.code);
    }
    logAction(tool, requestedId, "error internal");
    throw error;
  }
  const outcome = describe(value);
  logAction(tool, outcome.id, outcome.result);
  return value;
}

module.exports = { logAction, runAction };
