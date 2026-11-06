"use strict";

const auth = require(`${__hooks}/mcp/auth.js`);
const dispatcher = require(`${__hooks}/mcp/dispatcher.js`);

const MAX_BODY_BYTES = 64 * 1024;

// Request handler for /api/mcp. Never log or echo the token or the
// Authorization header.
function handleRequest(e) {
  const configured = String($os.getenv("MCP_AUTH_TOKEN") || "");
  if (!auth.isEnabled(configured)) return e.json(404, {});

  if (!auth.isAuthorized(e.request.header.get("Authorization"), configured)) {
    e.response.header().set("WWW-Authenticate", "Bearer");
    return e.json(401, { error: "unauthorized" });
  }

  if (e.request.method !== "POST") {
    e.response.header().set("Allow", "POST");
    return e.json(405, { error: "method_not_allowed" });
  }

  const contentLength = Number(e.request.header.get("Content-Length") || 0);
  if (contentLength > MAX_BODY_BYTES) return e.json(413, { error: "payload_too_large" });

  let text;
  try {
    text = readerToString(e.request.body, MAX_BODY_BYTES + 1);
  } catch (_) {
    return e.json(413, { error: "payload_too_large" });
  }
  if (text.length > MAX_BODY_BYTES) return e.json(413, { error: "payload_too_large" });

  const result = dispatcher.handleText(text, { app: $app });
  if (result.body === undefined) return e.noContent(202);
  return e.json(result.status, result.body);
}

module.exports = { MAX_BODY_BYTES, handleRequest };
