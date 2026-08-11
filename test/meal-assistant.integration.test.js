const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TOKEN = "integration-test-token-0123456789abcdef";

function findPocketBase() {
  if (process.env.POCKETBASE_BIN && fs.existsSync(process.env.POCKETBASE_BIN)) {
    return process.env.POCKETBASE_BIN;
  }
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

async function waitForServer(baseUrl, processHandle) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (processHandle.exitCode !== null) throw new Error("PocketBase exited before becoming ready");
    try {
      const response = await fetch(baseUrl + "/api/health");
      if (response.ok) return;
    } catch (_) {
      // The listener is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("PocketBase did not become ready");
}

async function jsonRequest(baseUrl, route, options = {}) {
  const headers = { Authorization: "Bearer " + TOKEN, ...(options.headers || {}) };
  const response = await fetch(baseUrl + route, { ...options, headers });
  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    // Some assertions only need the status.
  }
  return { response, payload };
}

test("meal assistant PocketBase routes", { timeout: 30_000 }, async (t) => {
  const pocketbase = findPocketBase();
  if (!pocketbase) {
    t.skip("set POCKETBASE_BIN to run PocketBase integration tests");
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meal-assistant-test-"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(pocketbase, [
    "serve",
    "--dir", path.join(tempDir, "pb_data"),
    "--migrationsDir", path.join(ROOT, "pb_migrations"),
    "--hooksDir", path.join(ROOT, "pb_hooks"),
    "--publicDir", path.join(tempDir, "pb_public"),
    "--http", `127.0.0.1:${port}`,
    "--automigrate=false",
    "--hooksWatch=false",
    "--dev=false",
  ], {
    env: { ...process.env, MEAL_ASSISTANT_TOKEN: TOKEN },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });

  t.after(async () => {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  try {
    await waitForServer(baseUrl, child);
  } catch (error) {
    assert.fail(error.message + "\n" + logs);
  }

  await t.test("missing bearer token returns 401", async () => {
    const response = await fetch(baseUrl + "/api/meal-assistant/context?date=2026-08-12");
    assert.equal(response.status, 401);
  });

  await t.test("invalid bearer token returns 401", async () => {
    const response = await fetch(baseUrl + "/api/meal-assistant/context?date=2026-08-12", {
      headers: { Authorization: "Bearer invalid" },
    });
    assert.equal(response.status, 401);
  });

  let context;
  await t.test("context returns Monday-Sunday schedule and household members", async () => {
    const result = await jsonRequest(baseUrl, "/api/meal-assistant/context?date=2026-08-12");
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get("cache-control"), "private, no-store");
    context = result.payload;
    assert.equal(context.targetDate, "2026-08-12");
    assert.equal(context.today.date, "2026-08-11");
    assert.equal(context.tomorrow.date, "2026-08-12");
    assert.deepEqual([context.week.start, context.week.end], ["2026-08-10", "2026-08-16"]);
    assert.equal(context.week.days.length, 7);
    assert.deepEqual(context.householdMembers.map((member) => member.name), ["Amir", "Maryam"]);
    assert.equal(context.tomorrow.meals.dinner.category.catId, 6);
  });

  await t.test("Monday and Sunday queries share the strict calendar-week boundary", async () => {
    for (const date of ["2026-08-10", "2026-08-16"]) {
      const result = await jsonRequest(baseUrl, "/api/meal-assistant/context?date=" + date);
      assert.equal(result.response.status, 200);
      assert.equal(result.payload.week.start, "2026-08-10");
      assert.equal(result.payload.week.end, "2026-08-16");
    }
  });

  const seedResult = await fetch(baseUrl + "/api/collections/dishes/records?perPage=1");
  const seedDish = (await seedResult.json()).items[0];

  await t.test("assigns an existing dish", async () => {
    const result = await jsonRequest(baseUrl, "/api/meal-assistant/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-08-12", meal: "breakfast", dishId: seedDish.id }),
    });
    assert.equal(result.response.status, 201);
    assert.equal(result.payload.assignment.dish.id, seedDish.id);
  });

  await t.test("same assignment is idempotent and remains untouched", async () => {
    const result = await jsonRequest(baseUrl, "/api/meal-assistant/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-08-12", meal: "breakfast", dishId: seedDish.id }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.unchanged, true);
  });

  let newDish;
  await t.test("creates a recipe dish and assigns it atomically", async () => {
    const result = await jsonRequest(baseUrl, "/api/meal-assistant/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-08-12",
        meal: "dinner",
        dish: {
          name: "Lemon herb salmon",
          categories: ["fish"],
          recipe: {
            ingredients: [{ name: "salmon", quantity: 2, unit: "fillets" }, "1 lemon"],
            instructions: ["Season the salmon", "Bake until done"],
            prepMinutes: 10,
            cookMinutes: 20,
          },
          difficulty: "easy",
        },
      }),
    });
    assert.equal(result.response.status, 201);
    assert.equal(result.payload.dishCreated, true);
    newDish = result.payload.assignment.dish;
    assert.equal(newDish.categories[0].catId, 6);
    assert.equal(newDish.recipe.ingredients[0].quantity, "2");
  });

  await t.test("protects against a duplicate date and meal assignment", async () => {
    const result = await jsonRequest(baseUrl, "/api/meal-assistant/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-08-12",
        meal: "dinner",
        dish: { name: "A different dinner" },
      }),
    });
    assert.equal(result.response.status, 409);
  });

  await t.test("context exposes existing assignments and weekly used dishes", async () => {
    const result = await jsonRequest(baseUrl, "/api/meal-assistant/context?date=2026-08-12");
    assert.equal(result.payload.tomorrow.meals.dinner.assignment.dish.id, newDish.id);
    assert.ok(result.payload.week.usedDishIds.includes(newDish.id));
  });

  await t.test("rejects invalid meal types", async () => {
    const result = await jsonRequest(baseUrl, "/api/meal-assistant/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-08-12", meal: "snack", dishId: seedDish.id }),
    });
    assert.equal(result.response.status, 400);
  });

  await t.test("creates attributable feedback from multiple household members", async () => {
    for (const [index, member] of context.householdMembers.entries()) {
      const result = await jsonRequest(baseUrl, "/api/meal-assistant/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: "2026-08-12",
          meal: "dinner",
          dishId: newDish.id,
          memberId: member.id,
          rating: index === 0 ? "liked" : "okay",
          makeAgain: index === 0 ? "yes" : "maybe",
          changes: index === 0 ? "More lemon" : "Less salt",
        }),
      });
      assert.equal(result.response.status, 201);
      assert.equal(result.payload.feedback.member.id, member.id);
    }
    const updated = await jsonRequest(baseUrl, "/api/meal-assistant/context?date=2026-08-12");
    assert.equal(updated.payload.tomorrow.meals.dinner.feedback.length, 2);
  });

  await t.test("uploads and bearer-protects a cooked photo", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const form = new FormData();
    form.set("type", "cooked");
    form.set("date", "2026-08-12");
    form.set("meal", "dinner");
    form.set("dishId", newDish.id);
    form.set("file", new Blob([png], { type: "image/png" }), "cooked.png");
    const upload = await jsonRequest(baseUrl, "/api/meal-assistant/photo", { method: "POST", body: form });
    assert.equal(upload.response.status, 200);
    const photo = upload.payload.occurrence.photos[0];
    assert.match(photo.url, /^\/api\/meal-assistant\/photo\/cooked\//);

    const unauthorized = await fetch(baseUrl + photo.url);
    assert.equal(unauthorized.status, 401);
    const authorized = await fetch(baseUrl + photo.url, {
      headers: { Authorization: "Bearer " + TOKEN },
    });
    assert.equal(authorized.status, 200);
    assert.equal(authorized.headers.get("content-type"), "image/png");
  });

  await t.test("stores a reference image separately from cooked photos", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const form = new FormData();
    form.set("type", "reference");
    form.set("dishId", newDish.id);
    form.set("file", new Blob([png], { type: "image/png" }), "reference.png");
    const upload = await jsonRequest(baseUrl, "/api/meal-assistant/photo", { method: "POST", body: form });
    assert.equal(upload.response.status, 200);
    assert.match(upload.payload.dish.referencePhoto.url, /^\/api\/meal-assistant\/photo\/reference\//);

    const rawPocketBaseUrl = upload.payload.dish.referencePhoto.url
      .replace("/api/meal-assistant/photo/reference/", "/api/files/dish_reference_photos/");
    const rawResponse = await fetch(baseUrl + rawPocketBaseUrl);
    assert.notEqual(rawResponse.status, 200);
  });
});
