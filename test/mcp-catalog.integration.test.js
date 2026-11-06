"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TOKEN = "mcp-catalog-token-" + "x".repeat(32);
const ADMIN_EMAIL = "mcp-catalog@example.com";
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

test("MCP catalog tools read dishes, history and household over HTTP", { timeout: 60_000 }, async (t) => {
  const pocketbase = findPocketBase();
  if (!pocketbase) {
    t.skip("set POCKETBASE_BIN to run PocketBase integration tests");
    return;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-catalog-"));
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
  const grill = categories.find((c) => c.catId === 2);
  const pan = categories.find((c) => c.catId === 1);
  const dish = await create("dishes", {
    name: "Integration Koobideh", lifecycle: "regular", catId: 2, categories: [pan.id], ingredients: ["minced beef", "onion"],
    instructions: ["Mix", "Grill"], prep_minutes: 20, cook_minutes: 15, difficulty: "medium", cuisine: "iranian",
    tags: ["meal:dinner"], notes: "Serve with rice",
  });
  const alex = await create("household_members", { name: "Integration Alex", active: true, preference_notes: "No mushrooms" });
  await create("household_members", { name: "Integration Retired", active: false, preference_notes: "inactive secret" });
  await create("telegram_users", { telegram_user_id: TELEGRAM_USER_ID, member: alex.id, active: true });
  await create("telegram_chats", { chat_id: TELEGRAM_CHAT_ID, type: "group", title: "Home", active: true });
  const occurrence = await create("cooked_occurrences", { date: "2026-11-03", meal: "dinner", dish: dish.id, modifications: "extra garlic" });
  await create("meal_feedback", { occurrence: occurrence.id, dish: dish.id, member: alex.id, rating: "liked", make_again: "yes", changes: "less salt" });

  await t.test("list_dishes returns fields and filters", async () => {
    const all = (await tool("list_dishes", {})).structuredContent;
    const found = all.dishes.find((d) => d.id === dish.id);
    assert.equal(found.catId, 2);
    assert.deepEqual(found.relatedCategories.map((c) => c.catId), [1]);
    assert.deepEqual(found.ingredients, ["minced beef", "onion"]);
    assert.equal(found.prepMinutes, 20);
    assert.equal(found.cookMinutes, 15);
    assert.equal(found.difficulty, "medium");
    assert.equal(found.cuisine, "iranian");
    assert.deepEqual(found.tags, ["meal:dinner"]);
    assert.equal(found.notes, "Serve with rice");
    const byQuery = (await tool("list_dishes", { query: "minced BEEF", categoryId: grill.catId })).structuredContent;
    assert.ok(byQuery.dishes.some((d) => d.id === dish.id));
    assert.equal((await tool("list_dishes", { limit: 1 })).structuredContent.dishes.length, 1);
  });

  await t.test("get_dish by id and name, and unknown", async () => {
    const byId = (await tool("get_dish", { id: dish.id })).structuredContent;
    assert.deepEqual(byId.instructions, ["Mix", "Grill"]);
    assert.equal((await tool("get_dish", { name: "integration koobideh" })).structuredContent.id, dish.id);
    const missing = await tool("get_dish", { name: "No Such Dish" });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /No dish/);
  });

  await t.test("get_history returns feedback and validates dates", async () => {
    const r = (await tool("get_history", { from: "2026-11-03", to: "2026-11-03" })).structuredContent;
    assert.equal(r.occurrences.length, 1);
    assert.equal(r.occurrences[0].dish.id, dish.id);
    assert.deepEqual(r.occurrences[0].feedback, [{ member: "Integration Alex", rating: "liked", make_again: "yes", changes: "less salt" }]);
    assert.equal((await tool("get_history", { from: "2026-11-04", to: "2026-11-10" })).structuredContent.occurrences.length, 0);
    assert.equal((await tool("get_history", { from: "2026-11-30", to: "2026-11-03" })).isError, true);
    assert.equal((await tool("get_history", { from: "bad", to: "2026-11-03" })).isError, true);
  });

  await t.test("get_household lists only active members and no Telegram identifiers", async () => {
    const result = await tool("get_household", {});
    const members = result.structuredContent.members;
    assert.deepEqual(members.find((m) => m.id === alex.id), { id: alex.id, name: "Integration Alex", preference_notes: "No mushrooms" });
    assert.equal(members.some((m) => m.name === "Integration Retired"), false);
    for (const member of members) assert.deepEqual(Object.keys(member).sort(), ["id", "name", "preference_notes"]);
    const text = JSON.stringify(result);
    assert.equal(text.includes(String(TELEGRAM_USER_ID)), false);
    assert.equal(text.includes(String(TELEGRAM_CHAT_ID)), false);
    assert.equal(/telegram|chat_id/i.test(text), false);
    assert.equal(text.includes("inactive secret"), false);
  });
});
