"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TOKEN = "mcp-plan-token-" + "x".repeat(32);
const ADMIN_EMAIL = "mcp-plan@example.com";
const ADMIN_PASSWORD = "mcp-plan-integration-password";

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

test("MCP plan tools read weeks, ranges, categories and rotation over HTTP", { timeout: 60_000 }, async (t) => {
  const pocketbase = findPocketBase();
  if (!pocketbase) {
    t.skip("set POCKETBASE_BIN to run PocketBase integration tests");
    return;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-plan-"));
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
  const dish = await create("dishes", { name: "Plan Koobideh", lifecycle: "regular", catId: 2 });
  await create("meal_assignments", { date: "2026-11-03", meal: "dinner", status: "planned", dish: dish.id, category: grill.id, selection_source: "telegram" });

  await t.test("get_week returns a seeded assignment, Saturday eating_out and the override", async () => {
    const week = (await tool("get_week", { date: "2026-11-05" })).structuredContent;
    assert.equal(week.start, "2026-11-02");
    assert.equal(week.days.length, 7);
    const tuesday = week.days[1].meals.dinner;
    assert.equal(tuesday.status, "planned");
    assert.deepEqual(tuesday.dish, { id: dish.id, name: "Plan Koobideh" });
    assert.equal(tuesday.selectionSource, "telegram");
    assert.equal(tuesday.category.catId, 2);
    assert.equal(week.days[5].meals.dinner.status, "eating_out");
    const current = (await tool("get_week", {})).structuredContent;
    assert.equal(current.days.length, 7);
  });

  await t.test("get_plan returns an inclusive range and rejects invalid ranges", async () => {
    const plan = (await tool("get_plan", { from: "2026-11-02", to: "2026-11-04" })).structuredContent;
    assert.deepEqual(plan.days.map((d) => d.date), ["2026-11-02", "2026-11-03", "2026-11-04"]);
    assert.equal(plan.days[1].meals.dinner.dish.id, dish.id);
    assert.equal((await tool("get_plan", { from: "2026-11-04", to: "2026-11-02" })).isError, true);
    assert.equal((await tool("get_plan", { from: "2026-01-01", to: "2026-12-31" })).isError, true);
    assert.equal((await tool("get_plan", { from: "bad", to: "2026-12-31" })).isError, true);
  });

  await t.test("list_categories returns every stored category", async () => {
    const result = (await tool("list_categories", {})).structuredContent;
    assert.equal(result.categories.length, categories.length);
    assert.deepEqual(Object.keys(result.categories[0]).sort(), ["catId", "effort", "effortMinutes", "emoji", "id", "name", "nameFa", "notes", "prepAhead", "style", "weekendOnly"]);
  });

  await t.test("get_rotation resolves concrete dates", async () => {
    const result = (await tool("get_rotation", { from: "2026-11-02", weeks: 2 })).structuredContent;
    assert.equal(result.days.length, 14);
    assert.equal(result.days[0].date, "2026-11-02");
    assert.equal(result.days[0].catId, result.days[0].category.catId);
    assert.equal(result.days[5].kind, "eat_out");
    assert.equal((await tool("get_rotation", {})).structuredContent.days.length, 14);
  });
  await t.test("write tools plan, status, clear and override against the real database", async () => {
    const future = "2099-03-03"; // a Tuesday far in the future
    const saturday = "2099-03-07";
    const day = (result) => result.structuredContent.meals.dinner;
    const assignments = async () => (await list("meal_assignments")).filter((a) => a.date.startsWith("2099-"));
    const pastDate = await tool("set_dinner", { date: "2020-01-01", dishName: "Never" });
    assert.equal(pastDate.isError, true);
    assert.equal(pastDate.structuredContent.code, "past_date");
    assert.equal((await assignments()).length, 0);

    const planned = await tool("set_dinner", { date: future, dishName: "MCP Stew", ingredients: ["lamb", "herbs"] });
    assert.equal(planned.isError, undefined, JSON.stringify(planned));
    assert.equal(day(planned).status, "planned");
    assert.equal(day(planned).selectionSource, "mcp");
    const created = (await list("dishes")).find((d) => d.name === "MCP Stew");
    assert.ok(created);
    assert.deepEqual(created.ingredients, ["lamb", "herbs"]);
    assert.equal(day(await tool("set_dinner", { date: saturday, dishId: dish.id })).status, "planned");
    const week = (await tool("get_week", { date: saturday })).structuredContent;
    assert.equal(week.days[5].meals.dinner.status, "planned");
    assert.equal(day(await tool("set_dinner", { date: "2099-03-04", dishName: "Plan Koobideh" })).dish.id, dish.id);

    const status = await tool("set_dinner_status", { date: future, status: "leftovers" });
    assert.equal(day(status).status, "leftovers");
    assert.equal(day(status).dish, null);
    assert.equal((await tool("set_dinner_status", { date: future, status: "planned" })).isError, true);

    const overridden = await tool("set_day_category", { date: "2099-03-05", catId: grill.catId });
    assert.equal(day(overridden).status, "unplanned");
    assert.equal(day(overridden).category.catId, grill.catId);
    assert.equal(day(overridden).selectionSource, "mcp");
    assert.equal((await tool("set_day_category", { date: "2099-03-05", catId: 999 })).structuredContent.code, "unknown_category");
    const restored = await tool("set_day_category", { date: "2099-03-05", catId: null });
    assert.equal(day(restored).status, "unplanned");
    assert.equal((await assignments()).some((a) => a.date.startsWith("2099-03-05")), false);

    const cleared = await tool("clear_dinner", { date: future });
    assert.equal(day(cleared).status, "unplanned");
    assert.equal((await assignments()).some((a) => a.date.startsWith(future)), false);

    const kept = (await assignments()).find((a) => a.date.startsWith("2099-03-04"));
    await create("cooked_occurrences", { date: "2099-03-04", meal: "dinner", assignment: kept.id, dish: dish.id });
    const blocked = await tool("clear_dinner", { date: "2099-03-04" });
    assert.equal(blocked.isError, true);
    assert.equal(blocked.structuredContent.code, "has_history");
    assert.ok((await assignments()).some((a) => a.id === kept.id));
    assert.match(logs, /MCP action: set_dinner 2099-03-03 -> planned MCP Stew/);
  });
});
