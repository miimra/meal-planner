"use strict";

// Thrown by tool handlers (and argument validation) for problems the agent can
// fix. tools/call turns it into a result with isError: true and a plain message.
function ToolError(message, code) {
  this.name = "ToolError";
  this.message = String(message);
  this.code = code || "tool_error";
}
ToolError.prototype = Object.create(Error.prototype);
ToolError.prototype.constructor = ToolError;

module.exports = { ToolError };
