"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TOKEN = "mcp-test-token-" + "x".repeat(32);

function findPocketBase() {
  if (process.env.POCKETBASE_BIN && fs.existsSync(process.env.POCKETBASE_BIN)) return process.env.POCKETBASE_BIN;
  const lookup = spawnSync("sh", ["-c", "command -v pocketbase"], { encoding: "utf8" });
  return lookup.status === 0 ? lookup.stdout.trim() : "";
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function start(t, mcpToken) {
  const pocketbase = findPocketBase();
  if (!pocketbase) {
    t.skip("set POCKETBASE_BIN to run PocketBase integration tests");
    return null;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-"));
  const hooksDir = path.join(tempDir, "pb_hooks");
  fs.cpSync(path.join(ROOT, "pb_hooks"), hooksDir, { recursive: true });
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = { ...process.env };
  delete env.MCP_AUTH_TOKEN;
  if (mcpToken !== undefined) env.MCP_AUTH_TOKEN = mcpToken;
  const child = spawn(pocketbase, [
    "serve", "--dir", path.join(tempDir, "pb_data"),
    "--hooksDir", hooksDir,
    "--publicDir", path.join(tempDir, "public"),
    "--http", `127.0.0.1:${port}`,
    "--automigrate=false", "--hooksWatch=false", "--dev=false",
  ], { stdio: ["ignore", "pipe", "pipe"], env });
  const state = { logs: "" };
  child.stdout.on("data", (chunk) => { state.logs += chunk; });
  child.stderr.on("data", (chunk) => { state.logs += chunk; });
  t.after(async () => {
    if (child.exitCode === null) {
      await new Promise((resolve) => { child.once("exit", resolve); child.kill("SIGTERM"); });
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) assert.fail(`PocketBase exited before starting\n${state.logs}`);
    try {
      const response = await fetch(baseUrl + "/api/health");
      if (response.ok) return { baseUrl, state };
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`PocketBase did not start\n${state.logs}`);
}

function rpc(baseUrl, body, headers = {}) {
  return fetch(baseUrl + "/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const auth = { Authorization: "Bearer " + TOKEN };
const PING = { jsonrpc: "2.0", id: 1, method: "ping" };

test("MCP endpoint authenticates and dispatches when a token is configured", { timeout: 30_000 }, async (t) => {
  const server = await start(t, TOKEN);
  if (!server) return;
  const { baseUrl, state } = server;

  // AC-4, AC-5: missing and wrong tokens get an identical, detail-free 401.
  const missing = await rpc(baseUrl, PING);
  const missingBody = await missing.text();
  const wrong = await rpc(baseUrl, PING, { Authorization: "Bearer " + "w".repeat(10) });
  const wrongBody = await wrong.text();
  const wrongLong = await rpc(baseUrl, PING, { Authorization: "Bearer " + "w".repeat(TOKEN.length) });
  assert.equal(missing.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(wrongLong.status, 401);
  assert.equal(wrongBody, missingBody);
  assert.equal(await wrongLong.text(), missingBody);
  assert.equal(missingBody.includes("jsonrpc"), false);
  assert.equal(/length|short|32/i.test(missingBody), false);

  // AC-12: ping and notifications.
  const ping = await rpc(baseUrl, PING, auth);
  assert.equal(ping.status, 200);
  assert.deepEqual(await ping.json(), { jsonrpc: "2.0", id: 1, result: {} });
  const note = await rpc(baseUrl, { jsonrpc: "2.0", method: "notifications/initialized" }, auth);
  assert.equal(note.status, 202);
  assert.equal(await note.text(), "");

  // AC-10, AC-11.
  const malformed = await rpc(baseUrl, "{nope", auth);
  assert.equal((await malformed.json()).error.code, -32700);
  const unknown = await rpc(baseUrl, { jsonrpc: "2.0", id: 2, method: "does/not/exist" }, auth);
  assert.equal((await unknown.json()).error.code, -32601);

  // AC-9: GET with a valid token.
  const get = await fetch(baseUrl + "/api/mcp", { headers: auth });
  assert.equal(get.status, 405);

  // AC-8: bodies over 64 KB.
  const big = JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping", params: { pad: "a".repeat(70 * 1024) } });
  assert.equal((await rpc(baseUrl, big, auth)).status, 413);
  const edge = JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping", params: { pad: "a".repeat(60 * 1024) } });
  assert.equal((await rpc(baseUrl, edge, auth)).status, 200);

  // AC-7: the token never shows up in logs.
  assert.equal(state.logs.includes(TOKEN), false);
  assert.equal(/MCP endpoint disabled/.test(state.logs), false);
});

test("MCP endpoint is 404 without MCP_AUTH_TOKEN and logs one disabled line", { timeout: 30_000 }, async (t) => {
  const server = await start(t, undefined);
  if (!server) return;
  const { baseUrl, state } = server;
  assert.equal((await rpc(baseUrl, PING)).status, 404);
  assert.equal((await rpc(baseUrl, PING, auth)).status, 404);
  assert.equal((await fetch(baseUrl + "/api/mcp", { headers: auth })).status, 404);
  assert.equal((await fetch(baseUrl + "/api/health")).status, 200);
  assert.equal(state.logs.split("\n").filter((line) => /MCP.*disabled/i.test(line)).length, 1);
});

test("MCP endpoint is 404 when the token is shorter than 32 characters", { timeout: 30_000 }, async (t) => {
  const short = "s".repeat(31);
  const server = await start(t, short);
  if (!server) return;
  const { baseUrl, state } = server;
  assert.equal((await rpc(baseUrl, PING, { Authorization: "Bearer " + short })).status, 404);
  assert.equal((await fetch(baseUrl + "/api/health")).status, 200);
  assert.equal(state.logs.split("\n").filter((line) => /MCP.*disabled/i.test(line)).length, 1);
  assert.equal(state.logs.includes(short), false);
});

test("MCP initialize, tools/list and tools/call work over HTTP", { timeout: 30_000 }, async (t) => {
  const server = await start(t, TOKEN);
  if (!server) return;
  const { baseUrl, state } = server;

  const init = await (await rpc(baseUrl, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, auth)).json();
  assert.equal(init.result.protocolVersion, "2025-03-26");
  assert.deepEqual(init.result.capabilities, { tools: {} });
  assert.equal(init.result.serverInfo.name, "meal-planner");
  assert.ok(init.result.instructions.length < 2000);

  const list = await (await rpc(baseUrl, { jsonrpc: "2.0", id: 2, method: "tools/list" }, auth)).json();
  const names = list.result.tools.map((tool) => tool.name);
  assert.ok(names.includes("get_context"));
  for (const tool of list.result.tools) {
    assert.ok(tool.title && tool.description);
    assert.equal(tool.inputSchema.type, "object");
  }

  const called = await (await rpc(baseUrl, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_context", arguments: {} } }, auth)).json();
  assert.match(called.result.structuredContent.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(JSON.parse(called.result.content[0].text), called.result.structuredContent);

  const unknown = await (await rpc(baseUrl, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope" } }, auth)).json();
  assert.equal(typeof unknown.error.code, "number");
  assert.ok(state.logs.includes("MCP call: get_context -> ok"));
  assert.equal(state.logs.includes(TOKEN), false);
});
