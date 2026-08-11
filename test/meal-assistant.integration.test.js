const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TOKEN = "integration-test-token-0123456789abcdef";
const SUPERUSER_EMAIL = "context-admin@example.com";
const SUPERUSER_PASSWORD = "integration-superuser-password";

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

function dateInAmsterdam(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addCalendarDays(value, count) {
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + count));
  return result.toISOString().slice(0, 10);
}

async function authenticateSuperuser(baseUrl) {
  const response = await fetch(baseUrl + "/api/collections/_superusers/auth-with-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload.token;
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
  const dataDir = path.join(tempDir, "pb_data");
  const processEnv = { ...process.env, MEAL_ASSISTANT_TOKEN: TOKEN };
  const setup = spawnSync(pocketbase, [
    "superuser", "upsert", SUPERUSER_EMAIL, SUPERUSER_PASSWORD,
    "--dir", dataDir,
    "--migrationsDir", path.join(ROOT, "pb_migrations"),
    "--hooksDir", path.join(ROOT, "pb_hooks"),
    "--dev=false",
  ], { env: processEnv, encoding: "utf8" });
  assert.equal(setup.status, 0, `${setup.stdout}\n${setup.stderr}`);

  const child = spawn(pocketbase, [
    "serve",
    "--dir", dataDir,
    "--migrationsDir", path.join(ROOT, "pb_migrations"),
    "--hooksDir", path.join(ROOT, "pb_hooks"),
    "--publicDir", path.join(tempDir, "pb_public"),
    "--http", `127.0.0.1:${port}`,
    "--automigrate=false",
    "--hooksWatch=false",
    "--dev=false",
  ], {
    env: processEnv,
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
  const superuserToken = await authenticateSuperuser(baseUrl);
  const membersResponse = await fetch(
    baseUrl + "/api/collections/household_members/records?sort=name&perPage=100",
    { headers: { Authorization: superuserToken } },
  );
  assert.equal(membersResponse.status, 200);
  const householdMembers = (await membersResponse.json()).items;

  const categoryResponse = await fetch(baseUrl + "/api/collections/categories/records?perPage=100");
  assert.equal(categoryResponse.status, 200);
  const categories = (await categoryResponse.json()).items;
  const fishCategory = categories.find((category) => category.catId === 6);

  await t.test("public context uses Amsterdam today and defaults the target to tomorrow", async () => {
    const before = dateInAmsterdam();
    const response = await fetch(baseUrl + "/api/meal-assistant/context");
    const payload = await response.json();
    const after = dateInAmsterdam();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^application\/json/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(payload.today.date === before || payload.today.date === after);
    assert.equal(payload.target.date, addCalendarDays(payload.today.date, 1));
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.timezone, "Europe/Amsterdam");
    assert.match(payload.generatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  let context;
  await t.test("explicit date returns the narrow Monday-Sunday read model", async () => {
    const response = await fetch(baseUrl + "/api/meal-assistant/context?date=2026-08-12");
    context = await response.json();

    assert.equal(response.status, 200);
    assert.equal(context.target.date, "2026-08-12");
    assert.deepEqual([context.week.start, context.week.end], ["2026-08-10", "2026-08-16"]);
    assert.equal(context.week.days.length, 7);
    assert.deepEqual(
      context.week.days.map((day) => day.date),
      [
        "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13",
        "2026-08-14", "2026-08-15", "2026-08-16",
      ],
    );
    for (const day of [context.today, context.target, ...context.week.days]) {
      assert.deepEqual(Object.keys(day.meals).sort(), ["breakfast", "dinner", "lunch"]);
    }
    assert.equal(context.target.meals.breakfast.category, null);
    assert.equal(context.target.meals.breakfast.assignment, null);
    assert.equal(context.target.meals.lunch.assignment, null);
    assert.deepEqual(context.target.meals.dinner.category, {
      id: fishCategory.id,
      name: fishCategory.name_en,
    });

    assert.deepEqual(Object.keys(context).sort(), [
      "generatedAt", "schemaVersion", "target", "timezone", "today", "week",
    ]);
    const serialized = JSON.stringify(context);
    for (const forbidden of [
      "householdMembers", "householdPreferences", "recentFeedback", "recentSuggestions",
      "email", "password", "token", "created", "updated", "notes", "preferenceNotes",
    ]) {
      assert.equal(serialized.includes(`\"${forbidden}\"`), false, forbidden);
    }
  });

  await t.test("invalid and impossible dates return a small 400 response", async () => {
    for (const date of ["abc", "2026-99-42", "2026-02-30", ""]) {
      const response = await fetch(baseUrl + "/api/meal-assistant/context?date=" + date);
      assert.equal(response.status, 400, date);
      assert.deepEqual(await response.json(), { error: "invalid_date" });
    }
  });

  await t.test("Monday and Sunday targets use the same real calendar week", async () => {
    for (const date of ["2026-08-10", "2026-08-16"]) {
      const response = await fetch(baseUrl + "/api/meal-assistant/context?date=" + date);
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.equal(payload.week.start, "2026-08-10");
      assert.equal(payload.week.end, "2026-08-16");
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

  await t.test("public context immediately reflects existing assignments", async () => {
    const response = await fetch(baseUrl + "/api/meal-assistant/context?date=2026-08-12");
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(payload.target.meals.breakfast.assignment, {
      dishId: seedDish.id,
      name: seedDish.name,
    });
    assert.deepEqual(payload.target.meals.dinner.assignment, {
      dishId: newDish.id,
      name: newDish.name,
    });
    const targetInWeek = payload.week.days.find((day) => day.date === "2026-08-12");
    assert.deepEqual(targetInWeek.meals.dinner.assignment, payload.target.meals.dinner.assignment);
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
    for (const [index, member] of householdMembers.entries()) {
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
    const filter = encodeURIComponent(`dish = '${newDish.id}'`);
    const feedbackResponse = await fetch(
      baseUrl + `/api/collections/meal_feedback/records?filter=${filter}&perPage=100`,
      { headers: { Authorization: superuserToken } },
    );
    assert.equal(feedbackResponse.status, 200);
    assert.equal((await feedbackResponse.json()).items.length, 2);
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
