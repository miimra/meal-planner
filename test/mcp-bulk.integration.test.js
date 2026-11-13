"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TOKEN = "mcp-bulk-token-" + "x".repeat(32);
const ADMIN_EMAIL = "mcp-bulk@example.com";
const ADMIN_PASSWORD = "mcp-bulk-integration-password";

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

test("MCP bulk tools write all-or-nothing against a real PocketBase", { timeout: 60_000 }, async (t) => {
  const pocketbase = findPocketBase();
  if (!pocketbase) {
    t.skip("set POCKETBASE_BIN to run PocketBase integration tests");
    return;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-bulk-"));
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
  const catId = (n) => categories.find((c) => c.catId === n).catId;
  const existing = await create("dishes", { name: "Bulk Existing", lifecycle: "regular", catId: 2 });
  const futureDay = (n) => `2099-04-${String(n).padStart(2, "0")}`;
  const assignments = async () => (await list("meal_assignments")).filter((a) => a.date.startsWith("2099-"));
  const dishNames = async () => (await list("dishes")).map((d) => d.name).sort();

  await t.test("bulk_set_days writes a mixed list, returns get_week shaped days in order and rejects pending suggestions", async () => {
    const pending = await create("meal_suggestions", { date: futureDay(2), meal: "dinner", outcome: "pending" });
    const result = await tool("bulk_set_days", { days: [
      { date: futureDay(4), status: "skipped" },
      { date: futureDay(2), dishId: existing.id },
      { date: futureDay(3), dishName: "Bulk Brand New", ingredients: ["rice"], catId: catId(3) },
      { date: futureDay(5), status: "eating_out" },
      { date: futureDay(6), status: "leftovers", catId: catId(4) },
      { date: futureDay(7), status: "buy_food" },
      { date: futureDay(8), dishName: "Bulk Existing" },
    ] });
    assert.equal(result.isError, undefined, JSON.stringify(result));
    const days = result.structuredContent.days;
    assert.deepEqual(days.map((d) => d.date), [4, 2, 3, 5, 6, 7, 8].map(futureDay));
    assert.equal(days[0].meals.dinner.status, "skipped");
    assert.equal(days[1].meals.dinner.dish.id, existing.id);
    assert.equal(days[2].meals.dinner.dish.name, "Bulk Brand New");
    assert.equal(days[2].meals.dinner.category.catId, catId(3));
    assert.equal(days[3].meals.dinner.status, "eating_out");
    assert.equal(days[4].meals.dinner.status, "leftovers");
    assert.equal(days[4].meals.dinner.category.catId, catId(4));
    assert.equal(days[5].meals.dinner.status, "buy_food");
    assert.equal(days[6].meals.dinner.dish.id, existing.id);
    assert.equal((await assignments()).length, 7);
    const created = (await list("dishes")).find((d) => d.name === "Bulk Brand New");
    assert.equal(created.catId, catId(3));
    assert.deepEqual(created.ingredients, ["rice"]);
    const week = (await tool("get_plan", { from: futureDay(2), to: futureDay(8) })).structuredContent;
    for (const day of days) assert.deepEqual(day, week.days.find((d) => d.date === day.date));
    const suggestion = (await list("meal_suggestions")).find((s) => s.id === pending.id);
    assert.equal(suggestion.outcome, "rejected");
    assert.equal(suggestion.rejection_reason, "manual_choice");
  });

  await t.test("bulk_set_days with an invalid item writes nothing, creates no dishes and names the index", async () => {
    const beforeAssignments = (await assignments()).length;
    const beforeDishes = await dishNames();
    const pending = await create("meal_suggestions", { date: futureDay(12), meal: "dinner", outcome: "pending" });
    for (const bad of [
      { date: "2020-01-01", status: "skipped" },
      { date: futureDay(13), dishId: "doesnotexist" },
      { date: futureDay(13), status: "skipped", catId: 9999 },
      { date: futureDay(13) },
      { date: futureDay(13), dishName: "x", status: "skipped" },
      { date: futureDay(12), status: "skipped" },
    ]) {
      const result = await tool("bulk_set_days", { days: [
        { date: futureDay(11), dishName: "Bulk Must Not Exist" },
        { date: futureDay(12), dishName: "Bulk Also Not" },
        bad,
      ] });
      assert.equal(result.isError, true, JSON.stringify(bad));
      assert.match(result.content[0].text, /days\[2\]/, JSON.stringify(bad));
      assert.equal((await assignments()).length, beforeAssignments);
      assert.deepEqual(await dishNames(), beforeDishes);
    }
    assert.equal((await list("meal_suggestions")).find((s) => s.id === pending.id).outcome, "pending");
  });

  await t.test("bulk_set_days enforces the 31 day limit", async () => {
    const make = (n) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2099, 5, 1 + i)).toISOString().slice(0, 10), status: "skipped" }));
    const before = (await assignments()).length;
    assert.equal((await tool("bulk_set_days", { days: make(32) })).isError, true);
    assert.equal((await assignments()).length, before);
    const ok = await tool("bulk_set_days", { days: make(31) });
    assert.equal(ok.isError, undefined, JSON.stringify(ok));
    assert.equal(ok.structuredContent.days.length, 31);
    assert.equal((await assignments()).length, before + 31);
  });

  await t.test("bulk_upsert_dishes creates and updates in order, and an invalid item writes nothing", async () => {
    const result = await tool("bulk_upsert_dishes", { dishes: [
      { name: "Bulk Soup", catId: catId(2), ingredients: ["water"] },
      { id: existing.id, notes: "bulk note" },
    ] });
    assert.equal(result.isError, undefined, JSON.stringify(result));
    const dishes = result.structuredContent.dishes;
    assert.deepEqual(dishes.map((d) => d.name), ["Bulk Soup", "Bulk Existing"]);
    assert.equal(dishes[1].notes, "bulk note");
    for (const dish of dishes) assert.deepEqual((await tool("get_dish", { id: dish.id })).structuredContent, dish);

    const before = await dishNames();
    for (const bad of [{ name: "Bulk Bad", catId: 9999 }, { name: "bulk soup" }, { name: "Bulk Dup" }, { id: "nope", notes: "x" }]) {
      const failed = await tool("bulk_upsert_dishes", { dishes: [{ name: "Bulk Dup" }, { name: "Bulk Fine" }, bad] });
      assert.equal(failed.isError, true, JSON.stringify(bad));
      assert.match(failed.content[0].text, /dishes\[2\]/, JSON.stringify(bad));
      assert.deepEqual(await dishNames(), before);
    }
    const make = (n) => Array.from({ length: n }, (_, i) => ({ name: "Bulk Many " + i }));
    assert.equal((await tool("bulk_upsert_dishes", { dishes: make(51) })).isError, true);
    assert.deepEqual(await dishNames(), before);
    assert.equal((await tool("bulk_upsert_dishes", { dishes: make(50) })).structuredContent.dishes.length, 50);
  });

  await t.test("tools/list advertises both bulk tools with input schemas", async () => {
    const response = await fetch(baseUrl + "/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: "tools/list" }),
    });
    const tools = (await response.json()).result.tools;
    for (const name of ["bulk_set_days", "bulk_upsert_dishes"]) {
      assert.equal(tools.find((x) => x.name === name).inputSchema.type, "object", name);
    }
  });
});
