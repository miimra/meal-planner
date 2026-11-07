"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TOKEN = "rotation-token-" + "x".repeat(32);
const ADMIN_EMAIL = "rotation@example.com";
const ADMIN_PASSWORD = "rotation-integration-password";

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

test("dinner_rotation migration, public rules and set_rotation_day against a real PocketBase", { timeout: 90_000 }, async (t) => {
  const pocketbase = findPocketBase();
  if (!pocketbase) {
    t.skip("set POCKETBASE_BIN to run PocketBase integration tests");
    return;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinner-rotation-"));
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

  async function publicCall(method, url, body) {
    const response = await fetch(baseUrl + url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }
  const categories = await list("categories");
  const catByCatId = (catId) => categories.find((c) => c.catId === catId);

  await t.test("migration seeds the 14 rows of today's table", async () => {
    const rows = await list("dinner_rotation");
    assert.equal(rows.length, 14);
    const expected = { 1: [12, 10, 7, 6, 2, null, 3], 2: [5, 11, 8, 9, 4, null, 1] };
    for (const week of [1, 2]) {
      expected[week].forEach((catId, weekday) => {
        const row = rows.find((r) => r.week === week && r.weekday === weekday);
        assert.ok(row, `week ${week} weekday ${weekday}`);
        if (catId === null) {
          assert.equal(row.kind, "eat_out");
          assert.equal(row.category, "");
        } else {
          assert.equal(row.category, catByCatId(catId).id);
          assert.equal(row.kind, "");
        }
      });
    }
  });

  await t.test("public can read but not create, update or delete", async () => {
    const listed = await publicCall("GET", "/api/collections/dinner_rotation/records?perPage=50");
    assert.equal(listed.status, 200);
    assert.equal(listed.body.items.length, 14);
    const id = listed.body.items[0].id;
    assert.equal((await publicCall("GET", `/api/collections/dinner_rotation/records/${id}`)).status, 200);
    assert.equal((await publicCall("POST", "/api/collections/dinner_rotation/records", { week: 1, weekday: 0, kind: "eat_out" })).status, 403);
    assert.equal((await publicCall("PATCH", `/api/collections/dinner_rotation/records/${id}`, { kind: "eat_out" })).status, 403);
    assert.equal((await publicCall("DELETE", `/api/collections/dinner_rotation/records/${id}`)).status, 403);
    assert.equal((await list("dinner_rotation")).length, 14);
  });

  await t.test("(week, weekday) is unique and bounded", async () => {
    const dup = await fetch(baseUrl + "/api/collections/dinner_rotation/records", { method: "POST", headers: adminHeaders, body: JSON.stringify({ week: 1, weekday: 0, kind: "eat_out" }) });
    assert.equal(dup.status, 400);
    const out = await fetch(baseUrl + "/api/collections/dinner_rotation/records", { method: "POST", headers: adminHeaders, body: JSON.stringify({ week: 3, weekday: 0, kind: "eat_out" }) });
    assert.equal(out.status, 400);
  });

  await t.test("set_rotation_day updates the row; get_rotation and get_week follow; assigned dates keep their category", async () => {
    // 2099-03-02 is a Monday; compute its rotation week from the anchor.
    const monday = "2099-03-02";
    const weeks = Math.round((Date.UTC(2099, 2, 2) - Date.UTC(2024, 0, 1)) / (7 * 86400000));
    const week = ((weeks % 2) + 2) % 2 === 0 ? 1 : 2;
    const before = (await tool("get_week", { date: monday })).structuredContent.days[1].meals.dinner;
    const target = categories.find((c) => c.catId !== before.category.catId && c.catId !== 2);
    const kebab = catByCatId(2);
    await create("meal_assignments", { date: "2099-03-04", meal: "dinner", status: "unplanned", category: kebab.id, selection_source: "mcp" });
    const wednesdayBefore = (await tool("get_week", { date: monday })).structuredContent.days[2].meals.dinner.category.catId;
    assert.equal(wednesdayBefore, 2);

    const set = await tool("set_rotation_day", { week, weekday: 1, catId: target.catId });
    assert.equal(set.isError, undefined);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(logs.includes(`MCP action: set_rotation_day week ${week} weekday 1 -> catId ${target.catId}`), logs.slice(-2000));
    assert.equal((await list("dinner_rotation")).length, 14);
    const rotation = (await tool("get_rotation", { from: monday, weeks: 1 })).structuredContent;
    assert.equal(rotation.days[1].catId, target.catId);
    assert.equal((await tool("get_week", { date: monday })).structuredContent.days[1].meals.dinner.category.catId, target.catId);

    // Change Wednesday's rotation too: the date with an assignment keeps its stored category.
    await tool("set_rotation_day", { week, weekday: 2, catId: target.catId });
    assert.equal((await tool("get_week", { date: monday })).structuredContent.days[2].meals.dinner.category.catId, 2);

    const eatOut = await tool("set_rotation_day", { week, weekday: 1, catId: "eat_out" });
    assert.equal(eatOut.isError, undefined);
    assert.equal((await tool("get_week", { date: monday })).structuredContent.days[1].meals.dinner.status, "eating_out");
  });

  await t.test("set_rotation_day rejects bad input and changes nothing", async () => {
    const snapshot = JSON.stringify((await list("dinner_rotation")).map((r) => [r.week, r.weekday, r.category, r.kind]).sort());
    for (const args of [{ week: 1, weekday: 0, catId: 99 }, { week: 3, weekday: 0, catId: 1 }, { week: 1, weekday: 7, catId: 1 }]) {
      const result = await tool("set_rotation_day", args);
      assert.equal(result.isError, true, JSON.stringify(args));
    }
    assert.equal(JSON.stringify((await list("dinner_rotation")).map((r) => [r.week, r.weekday, r.category, r.kind]).sort()), snapshot);
  });

  await t.test("down migration drops the collection", async () => {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    const down = spawnSync(pocketbase, ["migrate", "down", "1", "--dir", dataDir, ...dirs, "--dev=false"], { env, encoding: "utf8", input: "y\n" });
    assert.equal(down.status, 0, down.stdout + "\n" + down.stderr);
    const check = spawnSync("sqlite3", [path.join(dataDir, "data.db"), "select count(*) from _collections where name='dinner_rotation'"], { encoding: "utf8" });
    if (check.status === 0) assert.equal(check.stdout.trim(), "0");
    assert.match(down.stdout + down.stderr, /dinner_rotation|Reverted|reverted/i);
  });
});
