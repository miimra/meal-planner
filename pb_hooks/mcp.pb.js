/// <reference path="../pb_data/types.d.ts" />

// Authenticated MCP endpoint (Streamable HTTP, stateless, JSON only).
// Disabled (404) unless MCP_AUTH_TOKEN is set to at least 32 characters.
// PocketBase handlers cannot see outer-scope variables, so all logic lives in
// pb_hooks/mcp/.

routerAdd("POST", "/api/mcp", (e) => require(`${__hooks}/mcp/endpoint.js`).handleRequest(e));
routerAdd("GET", "/api/mcp", (e) => require(`${__hooks}/mcp/endpoint.js`).handleRequest(e));

$app.onServe().bindFunc((e) => {
  const auth = require(`${__hooks}/mcp/auth.js`);
  if (!auth.isEnabled(String($os.getenv("MCP_AUTH_TOKEN") || ""))) {
    console.log("MCP endpoint disabled: MCP_AUTH_TOKEN is unset or shorter than 32 characters");
  }
  return e.next();
});
