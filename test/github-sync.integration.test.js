const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TOKEN = "integration-test-token-0123456789abcdef";
const PRIVATE_TOKEN = "private-repository-read-token";
const SUPERUSER_EMAIL = "sync-admin@example.com";
const SUPERUSER_PASSWORD = "integration-superuser-password";
const USER_EMAIL = "household@example.com";
const USER_PASSWORD = "integration-user-password";
const SHA_1 = "1".repeat(40);
const SHA_2 = "2".repeat(40);
const SHA_3 = "3".repeat(40);
const TREE_1 = "a".repeat(40);
const TREE_2 = "b".repeat(40);
const TREE_3 = "c".repeat(40);
const DAY_PATH = "meal-data/days/2026/08/2026-08-12/day.json";

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

function recipe(id, name) {
  return {
    schemaVersion: 1,
    id,
    name,
    description: `${name} description`,
    categories: ["fish", "dinner"],
    cuisine: "Mediterranean",
    servings: 3,
    prepMinutes: 10,
    cookMinutes: 18,
    ingredients: [{ name: "ingredient", quantity: 1, unit: "piece", notes: null }],
    steps: [{ order: 1, instruction: `Prepare ${name}.` }],
    referencePhoto: null,
    createdAt: "2026-08-11T18:30:00+02:00",
    updatedAt: "2026-08-11T18:30:00+02:00",
  };
}

function emptyMeal() {
  return {
    category: null,
    status: "unplanned",
    plannedRecipeId: null,
    suggestions: [],
    cooked: null,
    feedback: [],
  };
}

function dayOne() {
  return {
    schemaVersion: 1,
    date: "2026-08-12",
    meals: {
      breakfast: emptyMeal(),
      lunch: emptyMeal(),
      dinner: {
        category: "fish",
        status: "cooked",
        plannedRecipeId: "lemon-herb-salmon",
        suggestions: [
          {
            id: "sug_rejected_001",
            recipeId: "old-fish-pie",
            suggestedAt: "2026-08-11T18:20:00+02:00",
            status: "rejected",
            decidedBy: "maryam",
            decidedAt: "2026-08-11T18:21:00+02:00",
            rejectionReason: "Too heavy",
          },
          {
            id: "sug_accepted_001",
            recipeId: "lemon-herb-salmon",
            suggestedAt: "2026-08-11T18:30:00+02:00",
            status: "accepted",
            decidedBy: "amir",
            decidedAt: "2026-08-11T18:31:00+02:00",
            rejectionReason: null,
          },
        ],
        cooked: {
          recipeId: "garlic-shrimp",
          cookedAt: "2026-08-12T18:45:00+02:00",
          changes: "Used shrimp instead of the planned salmon.",
          photos: [{
            url: "https://meal.number34.nl/photos/shrimp.jpg",
            takenBy: "amir",
            createdAt: "2026-08-12T18:50:00+02:00",
          }],
        },
        feedback: [
          {
            id: "feedback_amir_001",
            memberId: "amir",
            rating: "liked",
            makeAgain: "yes",
            notes: "More lemon next time.",
            createdAt: "2026-08-12T19:40:00+02:00",
          },
          {
            id: "feedback_maryam_001",
            memberId: "maryam",
            rating: "okay",
            makeAgain: "maybe",
            notes: "Less salt.",
            createdAt: "2026-08-12T19:41:00+02:00",
          },
        ],
      },
    },
  };
}

function dayTwo() {
  const day = dayOne();
  day.meals.dinner.plannedRecipeId = "garlic-shrimp";
  const previousAccepted = day.meals.dinner.suggestions[1];
  previousAccepted.status = "rejected";
  previousAccepted.rejectionReason = "Changed our minds";
  // An accidentally omitted older rejection is not destructively deleted by sync.
  day.meals.dinner.suggestions = [previousAccepted, {
    id: "sug_accepted_002",
    recipeId: "garlic-shrimp",
    suggestedAt: "2026-08-11T18:35:00+02:00",
    status: "accepted",
    decidedBy: "amir",
    decidedAt: "2026-08-11T18:36:00+02:00",
    rejectionReason: null,
  }];
  day.meals.dinner.feedback[0].notes = "The updated note from GitHub.";
  return day;
}

function household() {
  return {
    schemaVersion: 1,
    members: [
      { id: "amir", name: "Amir", active: true },
      { id: "maryam", name: "Maryam", active: true },
    ],
    preferences: { spicy: false, salt: "moderate", sugar: "moderate" },
  };
}

function createGitHubFixtureServer() {
  const state = {
    latest: SHA_1,
    malformedDay: false,
    commits: {
      [SHA_1]: {
        tree: TREE_1,
        files: {
          "meal-data/household.json": household(),
          "meal-data/recipes/lemon-herb-salmon.json": recipe("lemon-herb-salmon", "Lemon Herb Salmon"),
          "meal-data/recipes/garlic-shrimp.json": recipe("garlic-shrimp", "Garlic Shrimp"),
          "meal-data/recipes/old-fish-pie.json": recipe("old-fish-pie", "Old Fish Pie"),
          [DAY_PATH]: dayOne(),
        },
      },
      [SHA_2]: {
        tree: TREE_2,
        files: {
          "meal-data/household.json": household(),
          "meal-data/recipes/lemon-herb-salmon.json": {
            ...recipe("lemon-herb-salmon", "Updated Lemon Salmon"),
            updatedAt: "2026-08-12T07:00:00+02:00",
          },
          "meal-data/recipes/garlic-shrimp.json": recipe("garlic-shrimp", "Garlic Shrimp"),
          [DAY_PATH]: dayTwo(),
        },
      },
      [SHA_3]: {
        tree: TREE_3,
        files: {
          "meal-data/household.json": household(),
          "meal-data/recipes/lemon-herb-salmon.json": recipe("lemon-herb-salmon", "Updated Lemon Salmon"),
          "meal-data/recipes/garlic-shrimp.json": recipe("garlic-shrimp", "Garlic Shrimp"),
          "meal-data/recipes/new-after-failure.json": recipe("new-after-failure", "New After Failure"),
          [DAY_PATH]: dayTwo(),
        },
      },
    },
  };

  const server = http.createServer((request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${PRIVATE_TOKEN}`);
    const url = new URL(request.url, "http://localhost");
    const prefix = "/repos/test-owner/test-repo";
    response.setHeader("Content-Type", "application/json");

    if (url.pathname === `${prefix}/commits/master`) {
      const commit = state.commits[state.latest];
      response.end(JSON.stringify({ sha: state.latest, commit: { tree: { sha: commit.tree } } }));
      return;
    }

    if (url.pathname.startsWith(`${prefix}/git/trees/`)) {
      const commit = Object.values(state.commits).find((candidate) =>
        url.pathname.endsWith(candidate.tree));
      response.end(JSON.stringify({
        truncated: false,
        tree: [
          ...Object.keys(commit.files).map((filename) => ({ path: filename, type: "blob" })),
          { path: "meal-data/schema/day.schema.json", type: "blob" },
          { path: "README.md", type: "blob" },
        ],
      }));
      return;
    }

    if (url.pathname === `${prefix}/compare/${SHA_1}...${SHA_2}`) {
      response.end(JSON.stringify({ files: [
        { filename: "meal-data/recipes/lemon-herb-salmon.json", status: "modified" },
        { filename: DAY_PATH, status: "modified" },
        { filename: "meal-data/recipes/old-fish-pie.json", status: "removed" },
      ] }));
      return;
    }

    if (url.pathname === `${prefix}/compare/${SHA_2}...${SHA_3}`) {
      response.end(JSON.stringify({ files: [
        { filename: "meal-data/recipes/new-after-failure.json", status: "added" },
        { filename: DAY_PATH, status: "modified" },
      ] }));
      return;
    }

    if (url.pathname.startsWith(`${prefix}/contents/`)) {
      response.setHeader("Content-Type", "application/octet-stream");
      const filename = decodeURIComponent(url.pathname.slice(`${prefix}/contents/`.length));
      const commit = state.commits[url.searchParams.get("ref")];
      if (state.malformedDay && filename === DAY_PATH) {
        response.end("{ definitely not JSON");
      } else {
        response.end(JSON.stringify(commit.files[filename]));
      }
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ message: "not found" }));
  });
  return { server, state };
}

async function waitForServer(baseUrl, processHandle) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (processHandle.exitCode !== null) throw new Error("PocketBase exited before becoming ready");
    try {
      const response = await fetch(baseUrl + "/api/health");
      if (response.ok) return;
    } catch (_) {
      // Not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("PocketBase did not become ready");
}

async function sync(baseUrl) {
  const response = await fetch(baseUrl + "/api/internal/github-sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return { response, payload: await response.json() };
}

async function sourceDishes(baseUrl) {
  const filter = encodeURIComponent("github_recipe_id != ''");
  const response = await fetch(
    `${baseUrl}/api/collections/dishes/records?perPage=100&filter=${filter}`,
  );
  assert.equal(response.status, 200);
  return (await response.json()).items;
}

async function adminRecords(baseUrl, collection, token, options = {}) {
  const query = new URLSearchParams({ perPage: "100" });
  if (options.filter) query.set("filter", options.filter);
  if (options.expand) query.set("expand", options.expand);
  if (options.sort) query.set("sort", options.sort);
  const response = await fetch(
    `${baseUrl}/api/collections/${collection}/records?${query}`,
    { headers: { Authorization: token } },
  );
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload.items;
}

async function createAuthenticatedUser(baseUrl) {
  const superuserResponse = await fetch(
    baseUrl + "/api/collections/_superusers/auth-with-password",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD }),
    },
  );
  const superuserPayload = await superuserResponse.json();
  assert.equal(superuserResponse.status, 200, JSON.stringify(superuserPayload));
  const superuserToken = superuserPayload.token;

  const createResponse = await fetch(baseUrl + "/api/collections/users/records", {
    method: "POST",
    headers: {
      Authorization: superuserToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: USER_EMAIL,
      password: USER_PASSWORD,
      passwordConfirm: USER_PASSWORD,
    }),
  });
  const createPayload = await createResponse.json();
  assert.equal(createResponse.status, 200, JSON.stringify(createPayload));

  const authResponse = await fetch(baseUrl + "/api/collections/users/auth-with-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: USER_EMAIL, password: USER_PASSWORD }),
  });
  const authPayload = await authResponse.json();
  assert.equal(authResponse.status, 200, JSON.stringify(authPayload));
  return { userToken: authPayload.token, superuserToken };
}

test("GitHub meal-data synchronization", { timeout: 30_000 }, async (t) => {
  const pocketbase = findPocketBase();
  if (!pocketbase) {
    t.skip("set POCKETBASE_BIN to run PocketBase integration tests");
    return;
  }

  const fixture = createGitHubFixtureServer();
  const githubPort = await freePort();
  await new Promise((resolve) => fixture.server.listen(githubPort, "127.0.0.1", resolve));
  const pbPort = await freePort();
  const baseUrl = `http://127.0.0.1:${pbPort}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "github-meal-sync-test-"));
  const dataDir = path.join(tempDir, "pb_data");
  const processEnv = {
    ...process.env,
    MEAL_ASSISTANT_TOKEN: TOKEN,
    MEAL_DATA_GITHUB_OWNER: "test-owner",
    MEAL_DATA_GITHUB_REPO: "test-repo",
    MEAL_DATA_GITHUB_BRANCH: "master",
    MEAL_DATA_GITHUB_ROOT: "meal-data",
    MEAL_DATA_GITHUB_TOKEN: PRIVATE_TOKEN,
    MEAL_DATA_GITHUB_API_URL: `http://127.0.0.1:${githubPort}`,
    MEAL_DATA_SYNC_TIMEZONE: "Europe/Amsterdam",
  };
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
    "--http", `127.0.0.1:${pbPort}`,
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
    await new Promise((resolve) => fixture.server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  try {
    await waitForServer(baseUrl, child);
  } catch (error) {
    assert.fail(`${error.message}\n${logs}`);
  }
  const { userToken, superuserToken } = await createAuthenticatedUser(baseUrl);

  await t.test("manual endpoint rejects unauthenticated requests", async () => {
    const response = await fetch(baseUrl + "/api/internal/github-sync", { method: "POST" });
    assert.equal(response.status, 401);
  });

  await t.test("syncs new recipes, day slots, suggestions, differing cooked recipe, and feedback", async () => {
    const result = await sync(baseUrl);
    assert.equal(result.response.status, 200, JSON.stringify(result.payload));
    assert.equal(result.payload.status, "completed");
    assert.equal(result.payload.summary.recipesCreated, 3);
    assert.equal(result.payload.summary.daysUpserted, 1);
    assert.equal(result.payload.summary.mealSlotsUpserted, 3);
    assert.equal(result.payload.summary.suggestionsUpserted, 2);
    assert.equal(result.payload.summary.feedbackUpserted, 2);

    const assignment = (await adminRecords(baseUrl, "meal_assignments", superuserToken, {
      filter: "date = '2026-08-12' && meal = 'dinner'",
      expand: "dish",
    }))[0];
    const occurrence = (await adminRecords(baseUrl, "cooked_occurrences", superuserToken, {
      filter: "date = '2026-08-12' && meal = 'dinner'",
      expand: "dish",
    }))[0];
    const feedback = await adminRecords(baseUrl, "meal_feedback", superuserToken, {
      filter: `occurrence = '${occurrence.id}'`,
    });
    const suggestions = await adminRecords(baseUrl, "meal_suggestions", superuserToken);
    assert.equal(assignment.expand.dish.github_recipe_id, "lemon-herb-salmon");
    assert.equal(occurrence.expand.dish.github_recipe_id, "garlic-shrimp");
    assert.equal(feedback.length, 2);
    assert.deepEqual(
      feedback.map((item) => item.external_id).sort(),
      ["feedback_amir_001", "feedback_maryam_001"],
    );
    assert.ok(suggestions.some((item) =>
      item.external_id === "sug_rejected_001" && item.outcome === "rejected"));
  });

  await t.test("manual endpoint accepts a logged-in application user", async () => {
    const response = await fetch(baseUrl + "/api/internal/github-sync", {
      method: "POST",
      headers: { Authorization: userToken },
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.status, "unchanged");
  });

  await t.test("same Git commit and feedback import are idempotent", async () => {
    const result = await sync(baseUrl);
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.status, "unchanged");
    const feedback = await adminRecords(baseUrl, "meal_feedback", superuserToken);
    assert.equal(feedback.length, 2);
  });

  await t.test("updates an existing recipe/day and preserves rejected suggestions and deleted source records", async () => {
    const before = await sourceDishes(baseUrl);
    const lemonBefore = before.find((dish) => dish.github_recipe_id === "lemon-herb-salmon");
    fixture.state.latest = SHA_2;
    const result = await sync(baseUrl);
    assert.equal(result.response.status, 200, JSON.stringify(result.payload));
    assert.equal(result.payload.summary.recipesUpdated, 1);
    assert.equal(result.payload.summary.filesDeleted, 1);

    const after = await sourceDishes(baseUrl);
    const lemonAfter = after.find((dish) => dish.github_recipe_id === "lemon-herb-salmon");
    assert.equal(lemonAfter.id, lemonBefore.id);
    assert.equal(lemonAfter.name, "Updated Lemon Salmon");
    assert.ok(after.some((dish) => dish.github_recipe_id === "old-fish-pie"));

    const assignment = (await adminRecords(baseUrl, "meal_assignments", superuserToken, {
      filter: "date = '2026-08-12' && meal = 'dinner'",
      expand: "dish",
    }))[0];
    const suggestions = await adminRecords(baseUrl, "meal_suggestions", superuserToken);
    const feedback = await adminRecords(baseUrl, "meal_feedback", superuserToken);
    assert.equal(assignment.expand.dish.github_recipe_id, "garlic-shrimp");
    assert.ok(suggestions.some((item) => item.external_id === "sug_rejected_001"));
    assert.ok(suggestions.some((item) =>
      item.external_id === "sug_accepted_002" && item.outcome === "accepted"));
    const amir = feedback.find((item) => item.external_id === "feedback_amir_001");
    assert.equal(amir.changes, "The updated note from GitHub.");
  });

  await t.test("malformed JSON creates no partial records and does not advance sync state", async () => {
    fixture.state.latest = SHA_3;
    fixture.state.malformedDay = true;
    const failed = await sync(baseUrl);
    assert.equal(failed.response.status, 400, `${JSON.stringify(failed.payload)}\n${logs}`);
    assert.match(failed.payload.message, /Malformed JSON/);
    assert.equal((await sourceDishes(baseUrl)).some((dish) =>
      dish.github_recipe_id === "new-after-failure"), false);

    fixture.state.malformedDay = false;
    const retried = await sync(baseUrl);
    assert.equal(retried.response.status, 200, JSON.stringify(retried.payload));
    assert.equal(retried.payload.status, "completed");
    assert.equal((await sourceDishes(baseUrl)).some((dish) =>
      dish.github_recipe_id === "new-after-failure"), true);
  });
});
