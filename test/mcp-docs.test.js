"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("MCP documentation covers README, .env.example and DEPLOYMENT", () => {
  const readme = read("README.md");
  assert.match(readme, /^#+ MCP server/m);
  assert.match(readme, /\/api\/mcp/);
  assert.match(readme, /MCP_AUTH_TOKEN/);
  assert.match(readme, /curl[\s\S]*\/api\/mcp/);
  assert.match(readme, /block[\s\S]{0,80}\/api\/mcp|\/api\/mcp[\s\S]{0,200}(block|Cloudflare)/i);
  assert.match(read(".env.example"), /^MCP_AUTH_TOKEN=/m);
  assert.match(read("DEPLOYMENT.md"), /MCP/);
});
