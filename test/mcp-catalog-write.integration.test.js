"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TOKEN = "mcp-catalog-write-token-" + "x".repeat(32);
const ADMIN_EMAIL = "mcp-catalog-write@example.com";
const ADMIN_PASSWORD = "mcp-catalog-integration-password";
const TELEGRAM_USER_ID = 987654321;
const TELEGRAM_CHAT_ID = -1001234567890;

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

test("MCP catalog write tools edit categories and dishes over HTTP", { timeout: 60_000 }, async (t) => {
  const pocketbase = findPocketBase();
  if (!pocketbase) {
    t.skip("set POCKETBASE_BIN to run PocketBase integration tests");
    return;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-catalog-write-"));
  const dataDir = path.join(tempDir, "pb_data");
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = { ...process.env, APP_TIMEZONE: "Europe/Amsterdam", MCP_AUTH_TOKEN: TOKEN };
  const dirs = ["--migrationsDir", path.join(ROOT, "pb_migrations"), "--hooksDir", path.join(ROOT, "pb_hooks")];
  const setup = spawnSync(pocketbase, ["superuser", "upsert", ADMIN_EMAIL, ADMIN_PASSWORD, "--dir", dataDir, ...dirs, "--dev=false"], { env, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stdout + "\n" + setup.stderr);
  const child = spawn(pocketbase, [
    "serve", "--dir", dataDir, ...dirs, "--publicDir", path.join(tempDir, "public"),
    "--http", `127.0.0.1:${port}`, "--automigrate=false", "--hooksWatch=false", "--dev=false",
  ], { env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });
  t.after(async () => {
    if (child.exitCode === null) await new Promise((resolve) => { child.once("exit", resolve); child.kill("SIGTERM"); });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  for (let attempt = 0; ; attempt += 1) {
    if (child.exitCode !== null || attempt >= 600) assert.fail("PocketBase did not start\n" + logs);
    try { if ((await fetch(baseUrl + "/api/health")).ok) break; } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const authResponse = await fetch(baseUrl + "/api/collections/_superusers/auth-with-password", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const adminHeaders = { Authorization: "Bearer " + (await authResponse.json()).token, "Content-Type": "application/json" };
  async function create(collection, body) {
    const response = await fetch(baseUrl + `/api/collections/${collection}/records`, { method: "POST", headers: adminHeaders, body: JSON.stringify(body) });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    return payload;
  }
  async function list(collection) {
    const response = await fetch(baseUrl + `/api/collections/${collection}/records?perPage=500`, { headers: adminHeaders });
    return (await response.json()).items;
  }
  let nextId = 1;
  async function tool(name, args) {
    const response = await fetch(baseUrl + "/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.error, undefined, JSON.stringify(body));
    return body.result;
  }

  const categories = await list("categories");
  const maxCatId = Math.max(...categories.map((c) => c.catId));
  const quick = categories.find((c) => c.catId === 1);

  await t.test("update_category changes only the given fields and rejects bad input without writing", async () => {
    const before = (await list("categories")).find((c) => c.catId === 1);
    const bad = await tool("update_category", { catId: 1, effort_min: 500, effort_max: 10 });
    assert.equal(bad.isError, true);
    assert.equal((await tool("update_category", { catId: 1, nope: true })).isError, true);
    assert.equal((await tool("update_category", { catId: 1, name_en: 7 })).isError, true);
    const unchanged = (await list("categories")).find((c) => c.catId === 1);
    assert.deepEqual(unchanged, before);
    const ok = await tool("update_category", { catId: 1, notes: "Edited over MCP", weekend_only: true });
    assert.equal(ok.isError, undefined, JSON.stringify(ok));
    assert.equal(ok.structuredContent.catId, 1);
    assert.equal(ok.structuredContent.notes, "Edited over MCP");
    assert.equal(ok.structuredContent.weekendOnly, true);
    assert.equal(ok.structuredContent.name, before.name_en);
    const listed = (await tool("list_categories", {})).structuredContent.categories.find((c) => c.catId === 1);
    assert.deepEqual(listed, ok.structuredContent);
    await tool("update_category", { catId: 1, notes: before.notes, weekend_only: before.weekend_only });
  });

  await t.test("create_category takes max(catId) + 1 and refuses an empty name", async () => {
    const created = await tool("create_category", { name_en: "Integration Desserts", emoji: "🍰" });
    assert.equal(created.isError, undefined, JSON.stringify(created));
    assert.equal(created.structuredContent.catId, maxCatId + 1);
    assert.equal(created.structuredContent.name, "Integration Desserts");
    const count = (await list("categories")).length;
    assert.equal((await tool("create_category", { name_en: "" })).isError, true);
    assert.equal((await list("categories")).length, count);
  });

  await t.test("upsert_dish creates, partially updates and refuses a colliding rename", async () => {
    const created = await tool("upsert_dish", { name: "Integration Soup", catId: 1, categoryIds: [2], ingredients: ["water"], prep_minutes: 5 });
    assert.equal(created.isError, undefined, JSON.stringify(created));
    const dish = created.structuredContent;
    assert.equal(dish.catId, 1);
    assert.deepEqual(dish.relatedCategories.map((c) => c.catId), [2]);
    assert.deepEqual(dish.ingredients, ["water"]);
    const other = (await tool("upsert_dish", { name: "Integration Stew" })).structuredContent;
    const updated = await tool("upsert_dish", { id: dish.id, notes: "Hot", cook_minutes: 20 });
    assert.equal(updated.structuredContent.id, dish.id);
    assert.equal(updated.structuredContent.notes, "Hot");
    assert.equal(updated.structuredContent.prepMinutes, 5);
    assert.deepEqual(updated.structuredContent, (await tool("get_dish", { id: dish.id })).structuredContent);
    const taken = await tool("upsert_dish", { id: other.id, name: "integration soup", notes: "should not stick" });
    assert.equal(taken.isError, true);
    assert.match(taken.content[0].text, /name_taken/);
    const stored = (await list("dishes")).find((d) => d.id === other.id);
    assert.equal(stored.name, "Integration Stew");
    assert.equal(stored.notes, "");
    assert.equal((await tool("upsert_dish", { name: "Integration Soup" })).isError, true);
    assert.equal((await list("dishes")).filter((d) => d.name.startsWith("Integration S")).length, 2);
  });

  await t.test("tools/list advertises the write tools as not read-only", async () => {
    const response = await fetch(baseUrl + "/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
      body: JSON.stringify({ jsonrpc: "2.0", id: 999, method: "tools/list" }),
    });
    const tools = (await response.json()).result.tools;
    for (const name of ["update_category", "create_category", "upsert_dish"]) {
      const found = tools.find((x) => x.name === name);
      assert.equal(found.annotations.readOnlyHint, false, name);
      assert.equal(found.inputSchema.type, "object");
    }
    assert.match(logs, /MCP action: upsert_dish \S+ -> created/);
    assert.match(logs, /MCP action: update_category 1 -> ok/);
    assert.match(logs, /MCP action: create_category \d+ -> created/);
  });
});
