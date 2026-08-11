"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SECRET = "telegram-webhook-secret-0123456789";
const BOT_TOKEN = "TEST_BOT_TOKEN";
const ADMIN_EMAIL = "telegram-test@example.com";
const ADMIN_PASSWORD = "telegram-integration-password";

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

function readBody(request) {
  return new Promise((resolve, reject) => {
    let value = "";
    request.on("data", (chunk) => { value += chunk; });
    request.on("end", () => resolve(value));
    request.on("error", reject);
  });
}

async function startMockServer() {
  const telegram = [];
  const openrouter = [];
  let messageId = 100;
  const jpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=",
    "base64",
  );
  const server = http.createServer(async (request, response) => {
    const bodyText = await readBody(request);
    let body = {};
    try { body = bodyText ? JSON.parse(bodyText) : {}; } catch (_) {}

    if (request.url === "/openrouter/chat/completions") {
      openrouter.push(body);
      const user = JSON.parse(body.messages.find((message) => message.role === "user").content);
      const meals = user.requestedMeals.map((meal) => ({
        meal,
        name: user.preferences[meal] ? user.preferences[meal] + " skillet" : meal === "dinner" ? "Telegram lemon salmon" : meal === "lunch" ? "Herb sandwich" : "Spinach omelette",
        reason: "It fits the meal and keeps this week varied.",
        difficulty: meal !== "dinner" || user.preferences[meal] && /easy/i.test(user.preferences[meal]) ? "easy" : "medium",
        prepMinutes: meal === "dinner" ? 10 : 5,
        cookMinutes: meal === "dinner" ? 20 : 10,
        ingredients: ["500 g main ingredient", "1 onion", "2 tbsp olive oil"],
        babyServing: user.servings[meal].includesBaby
          ? "Set aside before seasoning, cook fully, and mash to a soft texture."
          : null,
        existingDishId: null,
      }));
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ meals }) } }] }));
      return;
    }

    const botPrefix = "/bot" + BOT_TOKEN + "/";
    if (request.url && request.url.startsWith(botPrefix)) {
      const method = request.url.slice(botPrefix.length);
      telegram.push({ method, body });
      let result = true;
      if (method === "sendMessage" || method === "editMessageText") result = { message_id: method === "sendMessage" ? ++messageId : body.message_id, chat: { id: body.chat_id } };
      if (method === "getFile") result = { file_path: "photos/meal.jpg", file_size: jpeg.length };
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, result }));
      return;
    }

    if (request.url === "/file/bot" + BOT_TOKEN + "/photos/meal.jpg") {
      response.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": jpeg.length });
      response.end(jpeg);
      return;
    }

    response.writeHead(404);
    response.end();
  });
  const port = await freePort();
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    openrouter,
    telegram,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error("PocketBase exited before becoming ready");
    try {
      const response = await fetch(baseUrl + "/api/health");
      if (response.ok) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("PocketBase did not become ready");
}

function amsterdamDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addDays(value, count) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
}

test("Telegram bot PocketBase integration", { timeout: 45_000 }, async (t) => {
  const pocketbase = findPocketBase();
  if (!pocketbase) {
    t.skip("set POCKETBASE_BIN to run PocketBase integration tests");
    return;
  }

  const mock = await startMockServer();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "telegram-meal-bot-"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = path.join(tempDir, "pb_data");
  const env = {
    ...process.env,
    APP_TIMEZONE: "Europe/Amsterdam",
    OPENROUTER_API_KEY: "test-openrouter-key",
    OPENROUTER_MODEL: "test/model",
    OPENROUTER_BASE_URL: mock.baseUrl + "/openrouter",
    TELEGRAM_API_BASE_URL: mock.baseUrl,
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: SECRET,
  };
  const setup = spawnSync(pocketbase, [
    "superuser", "upsert", ADMIN_EMAIL, ADMIN_PASSWORD,
    "--dir", dataDir,
    "--migrationsDir", path.join(ROOT, "pb_migrations"),
    "--hooksDir", path.join(ROOT, "pb_hooks"),
    "--dev=false",
  ], { env, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stdout + "\n" + setup.stderr);

  const child = spawn(pocketbase, [
    "serve",
    "--dir", dataDir,
    "--migrationsDir", path.join(ROOT, "pb_migrations"),
    "--hooksDir", path.join(ROOT, "pb_hooks"),
    "--publicDir", path.join(tempDir, "public"),
    "--http", `127.0.0.1:${port}`,
    "--automigrate=false",
    "--hooksWatch=false",
    "--dev=false",
  ], { env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });

  t.after(async () => {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    await mock.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  try { await waitForServer(baseUrl, child); } catch (error) { assert.fail(error.message + "\n" + logs); }

  const authResponse = await fetch(baseUrl + "/api/collections/_superusers/auth-with-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const auth = await authResponse.json();
  assert.equal(authResponse.status, 200, JSON.stringify(auth));
  const adminHeaders = { Authorization: "Bearer " + auth.token, "Content-Type": "application/json" };

  async function list(collection) {
    const response = await fetch(baseUrl + `/api/collections/${collection}/records?perPage=500`, { headers: adminHeaders });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    return payload.items;
  }

  async function create(collection, body) {
    const response = await fetch(baseUrl + `/api/collections/${collection}/records`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    return payload;
  }

  async function webhook(update, secret = SECRET) {
    return fetch(baseUrl + "/api/telegram/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
      body: JSON.stringify(update),
    });
  }

  const wrongSecret = await webhook({ update_id: 1 }, "wrong-secret");
  assert.equal(wrongSecret.status, 404, (await wrongSecret.text()) + "\n" + logs);

  await t.test("unauthorized users receive no response", async () => {
    const response = await webhook({ update_id: 2, message: { message_id: 1, from: { id: 999 }, chat: { id: 999, type: "private" }, text: "/start" } });
    assert.equal(response.status, 200);
    assert.equal(mock.telegram.length, 0);
    assert.equal((await list("telegram_updates")).find((item) => item.update_id === "2").status, "ignored");
  });

  const members = await list("household_members");
  const amir = members.find((member) => member.name === "Amir");
  const maryam = members.find((member) => member.name === "Maryam");
  const amirTelegram = await create("telegram_users", { telegram_user_id: "111", member: amir.id, active: true });
  await create("telegram_users", { telegram_user_id: "222", member: maryam.id, active: true });

  const groupChat = { id: -100123, type: "group", title: "Family meals" };
  await t.test("authorized group subscription is stored and duplicate updates are idempotent", async () => {
    const update = { update_id: 3, message: { message_id: 2, from: { id: 111 }, chat: groupChat, text: "/subscribe" } };
    assert.equal((await webhook(update)).status, 200);
    assert.equal(mock.telegram.filter((call) => call.method === "sendMessage").length, 1);
    assert.equal((await webhook(update)).status, 200);
    assert.equal(mock.telegram.filter((call) => call.method === "sendMessage").length, 1);
    const chats = await list("telegram_chats");
    assert.equal(chats[0].chat_id, "-100123");
    assert.equal(chats[0].daily_enabled, true);
    assert.equal(chats[0].registered_by, amirTelegram.id);
  });

  await t.test("authorized private commands work and unauthorized group callbacks stay silent", async () => {
    const before = mock.telegram.length;
    await webhook({
      update_id: 31,
      callback_query: { id: "unauthorized-callback", from: { id: 999 }, data: "act:buy:2026-08-12:dinner", message: { message_id: 20, chat: groupChat } },
    });
    assert.equal(mock.telegram.length, before);

    await webhook({
      update_id: 32,
      message: { message_id: 21, from: { id: 111 }, chat: { id: 111, type: "private", first_name: "Amir" }, text: "/today" },
    });
    assert.equal(mock.telegram.length, before + 1);
    assert.ok((await list("telegram_chats")).find((chat) => chat.chat_id === "111" && chat.type === "private"));
  });

  const today = amsterdamDate();
  const tomorrow = addDays(today, 1);
  const suggestionCategory = (await list("categories")).find((category) => category.catId === 5);
  assert.ok(suggestionCategory);
  await create("meal_assignments", {
    date: tomorrow,
    meal: "dinner",
    category: suggestionCategory.id,
    status: "unplanned",
    selection_source: "telegram",
  });

  let suggestion;
  await t.test("detailed OpenRouter suggestion respects and stores a free-form preference", async () => {
    const response = await webhook({ update_id: 4, message: { message_id: 3, from: { id: 111 }, chat: groupChat, text: "/suggest dinner very easy meat" } });
    assert.equal(response.status, 200);
    assert.equal(mock.openrouter.length, 1);
    suggestion = (await list("meal_suggestions")).find((item) => item.meal === "dinner" && item.outcome === "pending");
    assert.equal(suggestion.suggested_name, "very easy meat skillet");
    assert.equal(suggestion.request_text, "very easy meat");
    assert.equal(suggestion.difficulty, "easy");
    assert.equal(suggestion.prep_minutes, 10);
    assert.equal(suggestion.cook_minutes, 20);
    assert.deepEqual(suggestion.ingredients, ["500 g main ingredient", "1 onion", "2 tbsp olive oil"]);
    assert.equal(suggestion.baby_notes, "Set aside before seasoning, cook fully, and mash to a soft texture.");
    assert.equal(suggestion.model, "test/model");
    const request = JSON.parse(mock.openrouter[0].messages.find((message) => message.role === "user").content);
    assert.equal(request.preferences.dinner, "very easy meat");
    assert.deepEqual(request.excludedPreferences, {});
    assert.deepEqual(request.dinnerCategory, request.context.requested.dinner.category);
    const systemPrompt = mock.openrouter[0].messages.find((message) => message.role === "system").content;
    assert.match(systemPrompt, /exact per-meal serving profile/);
    assert.match(systemPrompt, /no chili or spicy heat/i);
    assert.match(systemPrompt, /vegetable-forward/);
    assert.match(systemPrompt, /little added salt and sugar/);
    assert.match(systemPrompt, /dinnerCategory is the highest-priority/);
    assert.match(systemPrompt, /Breakfast and lunch.*very simple/);
    const sent = mock.telegram.filter((call) => call.method === "sendMessage").at(-1).body.text;
    assert.match(sent, /Difficulty: <b>Easy<\/b>/);
    assert.match(sent, /30 min/);
    assert.match(sent, /What you need/);
    assert.match(sent, /500 g main ingredient/);
    assert.match(sent, /2 adults \+ 1 baby/);
    assert.match(sent, /Baby-safe/);
    assert.match(sent, /Baby serving:/);
    assert.match(sent, /Main dinner category:/);
    assert.doesNotMatch(sent, /53\n|91\n|44\n/);
  });

  await t.test("accept, buy food, and eat out actions upsert tomorrow", async () => {
    await webhook({
      update_id: 5,
      callback_query: { id: "callback-use", from: { id: 111 }, data: `sg:use:${suggestion.id}`, message: { message_id: 4, chat: groupChat } },
    });
    await webhook({
      update_id: 6,
      callback_query: { id: "callback-buy", from: { id: 111 }, data: `act:buy:${tomorrow}:lunch`, message: { message_id: 5, chat: groupChat } },
    });
    await webhook({
      update_id: 7,
      callback_query: { id: "callback-out", from: { id: 111 }, data: `act:out:${tomorrow}:breakfast`, message: { message_id: 6, chat: groupChat } },
    });
    const assignments = await list("meal_assignments");
    const dinner = assignments.find((item) => item.date === tomorrow && item.meal === "dinner" && item.status === "planned" && item.dish);
    assert.ok(dinner);
    const acceptedDish = (await list("dishes")).find((item) => item.id === dinner.dish);
    assert.equal(acceptedDish.difficulty, "easy");
    assert.equal(acceptedDish.prep_minutes, 10);
    assert.equal(acceptedDish.cook_minutes, 20);
    assert.deepEqual(acceptedDish.ingredients, ["500 g main ingredient", "1 onion", "2 tbsp olive oil"]);
    assert.ok(assignments.find((item) => item.date === tomorrow && item.meal === "lunch" && item.status === "buy_food" && !item.dish));
    assert.ok(assignments.find((item) => item.date === tomorrow && item.meal === "breakfast" && item.status === "eating_out" && !item.dish));
  });

  await t.test("an incompatible dinner request is excluded because category wins", async () => {
    await webhook({ update_id: 53, message: { message_id: 43, from: { id: 111 }, chat: groupChat, text: "/suggest dinner seafood" } });
    const request = JSON.parse(mock.openrouter.at(-1).messages.find((message) => message.role === "user").content);
    assert.deepEqual(request.preferences, {});
    assert.equal(request.excludedPreferences.dinner, "seafood");
    const replacement = (await list("meal_suggestions")).find((item) => item.meal === "dinner" && item.outcome === "pending");
    assert.equal(replacement.request_text, "seafood");
    assert.equal(replacement.request_status, "ignored_category");
    const sent = mock.telegram.filter((call) => call.method === "sendMessage").at(-1).body.text;
    assert.match(sent, /not applied; main category wins/);
  });

  await t.test("last meal replaces the current slot without confirmation", async () => {
    const dishes = await list("dishes");
    await create("meal_assignments", { date: today, meal: "lunch", dish: dishes[0].id, status: "planned", selection_source: "telegram" });
    await webhook({
      update_id: 40,
      callback_query: { id: "callback-last", from: { id: 111 }, data: `act:last:${tomorrow}:lunch`, message: { message_id: 30, chat: groupChat } },
    });
    const assignment = (await list("meal_assignments")).find((item) => item.date === tomorrow && item.meal === "lunch");
    assert.equal(assignment.dish, dishes[0].id);
    assert.equal(assignment.status, "planned");
    assert.equal(assignment.selection_source, "last_meal");
  });

  let occurrence;
  await t.test("feedback is per member and arms the current photo meal", async () => {
    const dishes = await list("dishes");
    const todayAssignment = await create("meal_assignments", { date: today, meal: "dinner", dish: dishes[0].id, status: "planned", selection_source: "telegram" });
    await webhook({ update_id: 8, message: { message_id: 7, from: { id: 111 }, chat: groupChat, text: "/feedback dinner" } });
    assert.equal((await list("cooked_occurrences")).some((item) => item.date === today && item.meal === "dinner"), false);
    await webhook({
      update_id: 9,
      callback_query: { id: "feedback-amir", from: { id: 111 }, data: `fa:liked:${todayAssignment.id}`, message: { message_id: 8, chat: groupChat } },
    });
    occurrence = (await list("cooked_occurrences")).find((item) => item.date === today && item.meal === "dinner");
    assert.ok(occurrence);
    await webhook({
      update_id: 10,
      callback_query: { id: "feedback-maryam", from: { id: 222 }, data: `fa:okay:${todayAssignment.id}`, message: { message_id: 8, chat: groupChat } },
    });
    const feedback = await list("meal_feedback");
    assert.equal(feedback.filter((item) => item.occurrence === occurrence.id).length, 2);
    assert.ok(feedback.find((item) => item.member === amir.id && item.rating === "liked" && item.make_again === "yes"));
    assert.ok(feedback.find((item) => item.member === maryam.id && item.rating === "okay" && item.make_again === "maybe"));
    const conversations = await list("telegram_conversations");
    assert.equal(conversations.length, 2, JSON.stringify(conversations));
    assert.ok(conversations.find((item) => item.telegram_user === amirTelegram.id));
  });

  await t.test("a current feedback photo is stored once and reports its meal", async () => {
    const before = (await list("meal_photos")).length;
    await webhook({
      update_id: 11,
      message: {
        message_id: 9,
        from: { id: 111 },
        chat: groupChat,
        photo: [
          { file_id: "small", file_unique_id: "photo-unique-small", file_size: 10 },
          { file_id: "large", file_unique_id: "photo-unique-large", file_size: 500 },
        ],
      },
    });
    const photoUpdate = (await list("telegram_updates")).find((item) => item.update_id === "11");
    assert.equal(photoUpdate.status, "processed", JSON.stringify(photoUpdate) + "\n" + logs);
    const photos = await list("meal_photos");
    assert.equal(photos.length, before + 1);
    assert.equal(photos.at(-1).occurrence, occurrence.id);
    assert.equal(photos.at(-1).member, amir.id);
    assert.ok(mock.telegram.some((call) => call.method === "sendMessage" && /Photo saved/.test(call.body.text)));

    await webhook({
      update_id: 12,
      message: { message_id: 10, from: { id: 111 }, chat: groupChat, photo: [{ file_id: "ignored", file_unique_id: "ignored", file_size: 100 }] },
    });
    assert.equal((await list("meal_photos")).length, photos.length);
  });

  await t.test("all three tomorrow suggestions are sent as separate meal cards", async () => {
    const before = mock.telegram.filter((call) => call.method === "sendMessage").length;
    await webhook({ update_id: 50, message: { message_id: 40, from: { id: 111 }, chat: groupChat, text: "/suggest" } });
    const after = mock.telegram.filter((call) => call.method === "sendMessage").length;
    assert.equal(after - before, 3);
    const request = mock.openrouter.at(-1);
    const context = JSON.parse(request.messages.find((message) => message.role === "user").content);
    assert.deepEqual(context.requestedMeals, ["breakfast", "lunch", "dinner"]);
    assert.deepEqual(context.preferences, {});
  });

  await t.test("Another keeps the original custom preference", async () => {
    await webhook({ update_id: 51, message: { message_id: 41, from: { id: 111 }, chat: groupChat, text: "/suggest lunch seafood" } });
    const lunchCard = mock.telegram.filter((call) => call.method === "sendMessage").at(-1).body.text;
    const targetDay = new Date(tomorrow + "T12:00:00Z").getUTCDay();
    if (targetDay >= 1 && targetDay <= 5) {
      assert.match(lunchCard, /Serves: <b>2 adults<\/b>/);
      assert.doesNotMatch(lunchCard, /1 baby|Baby serving:/);
    } else {
      assert.match(lunchCard, /2 adults \+ 1 baby/);
      assert.match(lunchCard, /Baby serving:/);
    }
    const lunch = (await list("meal_suggestions")).find((item) => item.meal === "lunch" && item.outcome === "pending" && item.request_text === "seafood");
    assert.ok(lunch);
    const sentBefore = mock.telegram.filter((call) => call.method === "sendMessage").length;
    await webhook({
      update_id: 52,
      callback_query: { id: "callback-another", from: { id: 111 }, data: `sg:next:${lunch.id}`, message: { message_id: 42, chat: groupChat } },
    });
    const context = JSON.parse(mock.openrouter.at(-1).messages.find((message) => message.role === "user").content);
    assert.equal(context.preferences.lunch, "seafood");
    assert.deepEqual(context.servings.lunch, targetDay >= 1 && targetDay <= 5
      ? { adults: 2, babies: 0, includesBaby: false, label: "2 adults" }
      : { adults: 2, babies: 1, includesBaby: true, label: "2 adults + 1 baby" });
    assert.equal(mock.telegram.filter((call) => call.method === "sendMessage").length, sentBefore);
    const edit = mock.telegram.filter((call) => call.method === "editMessageText").at(-1);
    assert.ok(edit);
    assert.equal(edit.body.message_id, 42);
    assert.match(edit.body.text, /500 g main ingredient/);
    assert.match(edit.body.reply_markup.inline_keyboard[0][1].callback_data, /^sg:next:/);
  });

  await t.test("the website read model is public while private household data stays locked", async () => {
    const assignments = await fetch(baseUrl + "/api/collections/meal_assignments/records?perPage=100");
    assert.equal(assignments.status, 200);
    const privateFeedback = await fetch(baseUrl + "/api/collections/meal_feedback/records?perPage=100");
    assert.equal(privateFeedback.status, 403);
    assert.equal((await fetch(baseUrl + "/api/meal-assistant/context")).status, 404);
    assert.equal((await fetch(baseUrl + "/api/internal/github-sync", { method: "POST" })).status, 404);
  });

  assert.equal(logs.includes("TELEGRAM_BOT_TOKEN"), false);
  assert.equal(logs.includes("test-openrouter-key"), false);
});
