"use strict";

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

function RpcError(code, message, data) {
  this.name = "RpcError";
  this.code = code;
  this.message = message;
  this.data = data;
}
RpcError.prototype = Object.create(Error.prototype);
RpcError.prototype.constructor = RpcError;

const builtinMethods = {
  ping: function () { return {}; },
};

function errorResponse(id, code, message) {
  return { jsonrpc: "2.0", id: id === undefined ? null : id, error: { code: code, message: message } };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validId(id) {
  return typeof id === "string" || (typeof id === "number" && isFinite(id));
}

function lookup(table, name) {
  return Object.prototype.hasOwnProperty.call(table, name) && typeof table[name] === "function" ? table[name] : null;
}

// Handles one parsed JSON-RPC message. Returns the response object, or null
// when no response must be sent (notifications). `methods` is optional and
// replaces the handler table (used by tests); by default the table in
// methods.js is merged over the built-ins.
function handle(message, context, methods) {
  if (!isPlainObject(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return errorResponse(isPlainObject(message) && validId(message.id) ? message.id : null, INVALID_REQUEST, "Invalid Request");
  }
  const isNotification = !Object.prototype.hasOwnProperty.call(message, "id");
  if (!isNotification && !validId(message.id)) {
    return errorResponse(null, INVALID_REQUEST, "Invalid Request");
  }
  if (isNotification) return null;

  const table = methods || require(`${__hooks}/mcp/methods.js`);
  const fn = lookup(builtinMethods, message.method) || lookup(table, message.method);
  if (!fn) return errorResponse(message.id, METHOD_NOT_FOUND, "Method not found");
  const params = message.params === undefined ? {} : message.params;
  if (!isPlainObject(params) && !Array.isArray(params)) {
    return errorResponse(message.id, INVALID_PARAMS, "Invalid params");
  }
  try {
    return { jsonrpc: "2.0", id: message.id, result: fn(params, context || {}) };
  } catch (error) {
    if (error && typeof error.code === "number" && error.name === "RpcError") {
      return errorResponse(message.id, error.code, String(error.message || "Error"));
    }
    return errorResponse(message.id, INTERNAL_ERROR, "Internal error");
  }
}

// Parses request text and dispatches it. Returns { status, body } where body is
// undefined for notifications (HTTP 202, empty body).
function handleText(text, context, methods) {
  let message;
  try {
    message = JSON.parse(text);
  } catch (_) {
    return { status: 200, body: errorResponse(null, PARSE_ERROR, "Parse error") };
  }
  const response = handle(message, context, methods);
  return response === null ? { status: 202 } : { status: 200, body: response };
}

module.exports = {
  INTERNAL_ERROR, INVALID_PARAMS, INVALID_REQUEST, METHOD_NOT_FOUND, PARSE_ERROR,
  RpcError, handle, handleText,
};
