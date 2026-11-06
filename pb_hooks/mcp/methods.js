"use strict";

const { RpcError, INVALID_PARAMS } = require(`${__hooks}/mcp/dispatcher.js`);
const { validateArgs } = require(`${__hooks}/mcp/args.js`);
const instructions = require(`${__hooks}/mcp/instructions.js`);

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "meal-planner", title: "Household Meal Planner", version: "0.1.0" };

function registry() {
  return require(`${__hooks}/mcp/tools/index.js`);
}

function initialize(params) {
  const requested = params && params.protocolVersion;
  const version = SUPPORTED_VERSIONS.indexOf(requested) !== -1 ? requested : SUPPORTED_VERSIONS[0];
  return {
    protocolVersion: version,
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO,
    instructions: instructions,
  };
}

function toolsList() {
  return {
    tools: registry().map(function (t) {
      return { name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations };
    }),
  };
}

// One log line per call: tool name and outcome only, never arguments or the token.
function logCall(name, outcome) {
  console.log(`MCP call: ${String(name).slice(0, 100)} -> ${outcome}`);
}

function failure(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

function toolsCall(params, context) {
  const name = params && params.name;
  const tool = typeof name === "string" ? registry().find(function (t) { return t.name === name; }) : null;
  if (!tool) {
    logCall(name, `error ${INVALID_PARAMS}`);
    throw new RpcError(INVALID_PARAMS, "Unknown tool");
  }
  try {
    const args = validateArgs(tool.inputSchema, params.arguments);
    const result = tool.handler((context && context.app) || null, args);
    logCall(name, "ok");
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  } catch (error) {
    if (error && error.name === "ToolError") {
      logCall(name, `error ${error.code}`);
      return failure(error.message);
    }
    logCall(name, "error internal");
    return failure("Internal error while running the tool");
  }
}

module.exports = { initialize, "tools/list": toolsList, "tools/call": toolsCall, SUPPORTED_VERSIONS };
