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
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function startMockServer() {
  const telegram = [];
  const mealRequests = [];
  const ingredientRequests = [];
  const assistantRequests = [];
  const photoRequests = [];
  const recipeRequests = [];
  const youtubeRequests = [];
  let recipeCategoryMode = "valid";
  let messageId = 100;
  let mealSequence = 0;
  let imageSequence = 0;
  let failPhotos = 0;
  const jpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=",
    "base64",
  );
  const server = http.createServer(async (request, response) => {
    const bytes = await readBody(request);
    const bodyText = bytes.toString("utf8");
    let body = {};
    try { body = bodyText ? JSON.parse(bodyText) : {}; } catch (_) {}

    if (request.url === "/openrouter/chat/completions") {
      const user = JSON.parse(body.messages.find((message) => message.role === "user").content);
      if (Array.isArray(user.requestedMeals)) {
        mealRequests.push(body);
        mealSequence += 1;
        const meals = user.requestedMeals.map((meal) => ({
          meal,
          name: `${meal} suggestion ${mealSequence}`,
          reason: "It fits the household plan and keeps this week varied.",
          difficulty: "easy",
          prepMinutes: 5,
          cookMinutes: meal === "dinner" ? 20 : 10,
          ingredients: ["500 g main ingredient", "1 onion", "2 tbsp olive oil"],
          babyServing: user.servings[meal].includesBaby ? "Set aside before seasoning and mash to a soft texture." : null,
          existingDishId: null,
        }));
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ meals }) } }] }));
        return;
      }
      if (user.source && Array.isArray(user.allowedCategories)) {
        recipeRequests.push(user);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
          recipe: {
            name: "Saved YouTube lentil soup",
            description: "A simple vegetable-forward lentil soup.",
            ingredients: ["250 g lentils", "2 carrots", "1 onion", "1 litre water"],
            instructions: ["Chop the vegetables.", "Simmer everything until tender."],
            prepMinutes: 10, cookMinutes: 30, totalMinutes: 40, servings: 4,
            difficulty: "easy", cuisine: "Mediterranean", mealTypes: ["dinner"],
            category: recipeCategoryMode === "invalid" ? "Not a household category" : user.allowedCategories[0], tags: ["lentils"], babyServing: "Blend a salt-free portion.", imageUrl: null,
          },
          confidence: 0.91,
          missingFields: [],
        }) } }] }));
        return;
      }
      if (user.dishName) {
        ingredientRequests.push(user);
        const known = !/unknown/i.test(user.dishName);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
          known,
          ingredients: known ? ["500 g main ingredient", "1 onion", "2 tbsp olive oil"] : [],
        }) } }] }));
        return;
      }
      assistantRequests.push(user);
      const answer = user.deterministicDraft || "The stored household context suggests a simple answer <without HTML>.";
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: answer } }] }));
      return;
    }

    if (request.url && request.url.startsWith("/youtube/videos?")) {
      youtubeRequests.push(request.url);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ items: [{
        id: "abc123xyz99",
        snippet: { title: "Lentil soup recipe", description: "Ingredients and method are explained in this cooking video.", thumbnails: { high: { url: "https://i.ytimg.com/example.jpg" } } },
        contentDetails: { duration: "PT4M" },
      }] }));
      return;
    }

    if (request.url && request.url.startsWith("/wikipedia/w/api.php?")) {
      photoRequests.push(request.url);
      if (failPhotos > 0) {
        failPhotos -= 1;
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "temporary" }));
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ query: { pages: [
        { title: "Not a photo", thumbnail: { source: "https://commons.wikimedia.org/logo.svg" } },
        { title: "Dish", thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/b/Dish.jpg/1000px-Dish.jpg" } },
      ] } }));
      return;
    }

    if (request.url && request.url.startsWith("/openverse/v1/images/?")) {
      photoRequests.push(request.url);
      if (failPhotos > 0) {
        failPhotos -= 1;
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "temporary" }));
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ results: [{ url: "https://live.staticflickr.com/1/dish_b.jpg" }] }));
      return;
    }

    const botPrefix = "/bot" + BOT_TOKEN + "/";
    if (request.url && request.url.startsWith(botPrefix)) {
      const method = request.url.slice(botPrefix.length);
      const contentType = String(request.headers["content-type"] || "");
      const call = contentType.startsWith("multipart/form-data")
        ? { method, multipart: true, contentType, raw: bodyText }
        : { method, body };
      telegram.push(call);
      let result = true;
      if (method === "sendMessage") result = { message_id: ++messageId, chat: { id: body.chat_id } };
      if (method === "editMessageText" || method === "editMessageCaption") {
        const multipartMessageId = Number((bodyText.match(/name="message_id"\r\n\r\n(\d+)/) || [])[1]) || 0;
        result = {
          message_id: call.multipart ? multipartMessageId : body.message_id,
          chat: { id: call.multipart ? -100123 : body.chat_id },
        };
        const richMessage = call.multipart ? /name="rich_message"/.test(bodyText) : Boolean(body.rich_message);
        if (richMessage) {
          imageSequence += 1;
          result.rich_message = { blocks: [{ photo: [{ file_id: "telegram-image-" + imageSequence }] }] };
        }
      }
      if (method === "sendPhoto") {
        imageSequence += 1;
        result = { message_id: ++messageId, photo: [{ file_id: "telegram-image-" + imageSequence }] };
      }
      if (method === "editMessageMedia") {
        imageSequence += 1;
        result = { message_id: call.multipart ? Number((bodyText.match(/name="message_id"\r\n\r\n(\d+)/) || [])[1]) || 999 : body.message_id, photo: [{ file_id: "telegram-image-" + imageSequence }] };
      }
      if (method === "getFile") result = { file_path: "photos/meal.jpg", file_size: jpeg.length };
      call.result = result;
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
    telegram,
    mealRequests,
    ingredientRequests,
    assistantRequests,
    photoRequests,
    failNextPhoto() { failPhotos += 2; },
    recipeRequests,
    youtubeRequests,
    setRecipeCategoryMode(value) { recipeCategoryMode = value; },
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
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addDays(value, count) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
}

function nextWeekday(value, weekday) {
  const current = new Date(value + "T12:00:00Z").getUTCDay();
  const offset = ((weekday - current) + 7) % 7;
  return addDays(value, offset);
}

test("Telegram household assistant PocketBase integration", { timeout: 60_000 }, async (t) => {
  const pocketbase = findPocketBase();
  if (!pocketbase) {
    t.skip("set POCKETBASE_BIN to run PocketBase integration tests");
    return;
  }

  const mock = await startMockServer();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "telegram-household-assistant-"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = path.join(tempDir, "pb_data");
  const env = {
    ...process.env,
    APP_TIMEZONE: "Europe/Amsterdam",
    OPENROUTER_API_KEY: "test-openrouter-key",
    OPENROUTER_MODEL: "test/text-model",
    OPENROUTER_BASE_URL: mock.baseUrl + "/openrouter",
    TELEGRAM_API_BASE_URL: mock.baseUrl,
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_BOT_USERNAME: "moghassemi_family_assistant_bot",
    TELEGRAM_WEBHOOK_SECRET: SECRET,
    YOUTUBE_API_KEY: "test-youtube-key",
    YOUTUBE_API_BASE_URL: mock.baseUrl + "/youtube",
    WIKIPEDIA_API_BASE_URL: mock.baseUrl + "/wikipedia",
    OPENVERSE_API_BASE_URL: mock.baseUrl + "/openverse",
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
    "serve", "--dir", dataDir,
    "--migrationsDir", path.join(ROOT, "pb_migrations"),
    "--hooksDir", path.join(ROOT, "pb_hooks"),
    "--publicDir", path.join(tempDir, "public"),
    "--http", `127.0.0.1:${port}`,
    "--automigrate=false", "--hooksWatch=false", "--dev=false",
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

  await t.test("startup registers exactly three visible commands", () => {
    const registration = mock.telegram.find((call) => call.method === "setMyCommands");
    assert.deepEqual(registration.body.commands.map((item) => item.command), ["home", "plan", "settings"]);
  });

  const authResponse = await fetch(baseUrl + "/api/collections/_superusers/auth-with-password", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
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
    const response = await fetch(baseUrl + `/api/collections/${collection}/records`, { method: "POST", headers: adminHeaders, body: JSON.stringify(body) });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    return payload;
  }
  async function webhook(update, secret = SECRET) {
    return fetch(baseUrl + "/api/telegram/webhook", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret }, body: JSON.stringify(update),
    });
  }
  let updateId = 10;
  const nextUpdate = () => ++updateId;
  const groupChat = { id: -100123, type: "group", title: "Home" };
  const privateChat = { id: 111, type: "private", first_name: "Alex" };

  await t.test("the replacement dinner taxonomy and cross-category relations are migrated", async () => {
    const categories = (await list("categories")).sort((left, right) => left.catId - right.catId);
    assert.deepEqual(categories.map((item) => item.name_en), [
      "Quick Iranian",
      "Iranian Grills",
      "Iranian Stews & Slow Dishes",
      "Iranian Rice & Dami",
      "International Mains",
      "Seafood",
      "Pasta & Noodles",
      "Casual Favorites",
      "Handheld & Oven Meals",
      "Salads & Light Plates",
      "Simple Soups & No-Cook",
      "Flexible Choice",
    ]);
    const byCatId = new Map(categories.map((item) => [item.catId, item]));
    const dishes = await list("dishes");
    const pizza = dishes.find((item) => /پیتزا/.test(item.name));
    const shrimpPasta = dishes.find((item) => /میگو پاستا/.test(item.name));
    assert.equal(pizza.catId, 8);
    assert.ok(pizza.categories.includes(byCatId.get(8).id));
    assert.ok(pizza.categories.includes(byCatId.get(9).id));
    assert.ok(shrimpPasta.categories.includes(byCatId.get(6).id));
    assert.ok(shrimpPasta.categories.includes(byCatId.get(7).id));
  });

  assert.equal((await webhook({ update_id: 1 }, "wrong-secret")).status, 404);
  await t.test("unauthorized users are silent", async () => {
    const before = mock.telegram.length;
    await webhook({ update_id: 2, message: { message_id: 1, from: { id: 999 }, chat: { id: 999, type: "private" }, text: "What is tomorrow?" } });
    assert.equal(mock.telegram.length, before);
    assert.equal((await list("telegram_updates")).find((item) => item.update_id === "2").status, "ignored");
  });

  const members = await list("household_members");
  const alex = members.find((member) => member.name === "Alex");
  const sam = members.find((member) => member.name === "Sam");
  const alexTelegram = await create("telegram_users", { telegram_user_id: "111", member: alex.id, active: true });
  await create("telegram_users", { telegram_user_id: "222", member: sam.id, active: true });

  await t.test("each user message gets a new response while buttons edit only their originating message", async () => {
    await webhook({ update_id: nextUpdate(), message: { message_id: 2, from: { id: 111, first_name: "Alex" }, chat: groupChat, text: "/start" } });
    await webhook({ update_id: nextUpdate(), message: { message_id: 3, from: { id: 111 }, chat: groupChat, text: "/plan" } });
    const sent = mock.telegram.filter((call) => call.method === "sendMessage").slice(-2);
    assert.equal(sent.length, 2);
    assert.deepEqual(sent.map((call) => call.body.reply_parameters), [{ message_id: 2 }, { message_id: 3 }]);
    assert.match(sent[1].body.text, /Dinners for the week/);
    const sendsAfterMessages = mock.telegram.filter((call) => call.method === "sendMessage").length;
    await webhook({ update_id: nextUpdate(), callback_query: { id: "home", from: { id: 111 }, data: "nav:home", message: { message_id: 701, chat: groupChat } } });
    assert.equal(mock.telegram.filter((call) => call.method === "sendMessage").length, sendsAfterMessages);
    const edit = mock.telegram.filter((call) => call.method === "editMessageText").at(-1);
    assert.equal(edit.body.message_id, 701);
  });

  await t.test("private text and mentioned/replied group text are answered, unmentioned group text is ignored", async () => {
    const before = mock.assistantRequests.length;
    const sendsBefore = mock.telegram.filter((call) => call.method === "sendMessage").length;
    await webhook({ update_id: nextUpdate(), message: { message_id: 4, from: { id: 111 }, chat: groupChat, text: "What should we eat?" } });
    assert.equal(mock.assistantRequests.length, before);
    await webhook({ update_id: nextUpdate(), message: { message_id: 5, from: { id: 111 }, chat: groupChat, text: "@moghassemi_family_assistant_bot what should we eat?" } });
    await webhook({ update_id: nextUpdate(), message: { message_id: 6, from: { id: 111 }, chat: groupChat, text: "And why?", reply_to_message: { from: { is_bot: true, username: "moghassemi_family_assistant_bot" } } } });
    await webhook({ update_id: nextUpdate(), message: { message_id: 7, from: { id: 111 }, chat: privateChat, text: "What does the family like?" } });
    assert.equal(mock.assistantRequests.length, before + 3);
    assert.equal(mock.telegram.filter((call) => call.method === "sendMessage").length, sendsBefore + 3);
    const lastPanel = mock.telegram.filter((call) => call.method === "sendMessage" || call.method === "editMessageText").at(-1);
    assert.match(lastPanel.body.text, /&lt;without HTML&gt;/);
    assert.deepEqual(lastPanel.body.reply_parameters, { message_id: 7 });
  });

  const today = amsterdamDate();
  const tomorrow = addDays(today, 1);
  // Whether "today" itself needs the Sunday category gate: true on one day in
  // seven, whatever real-world weekday the suite happens to run on.
  const todayIsSunday = nextWeekday(today, 0) === today;
  // Monday, Tuesday and Wednesday always resolve to a single dinner category,
  // so these flows never hit the Sunday choice gate whatever day the suite runs.
  const planDay = nextWeekday(addDays(today, 1), 1);
  const secondPlanDay = addDays(planDay, 1);
  const thirdPlanDay = addDays(planDay, 2);
  await t.test("today, tomorrow, and burger-date answers are grounded in deterministic stored facts", async () => {
    const chosenDish = (await list("dishes"))[0];
    await create("meal_assignments", { date: today, meal: "dinner", dish: chosenDish.id, status: "planned", selection_source: "telegram" });
    await webhook({ update_id: nextUpdate(), message: { message_id: 80, from: { id: 111 }, chat: privateChat, text: "What is today's food?" } });
    assert.match(mock.assistantRequests.at(-1).deterministicDraft, new RegExp("Today \\(.*" + today));
    assert.match(mock.assistantRequests.at(-1).deterministicDraft, new RegExp(chosenDish.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await webhook({ update_id: nextUpdate(), message: { message_id: 8, from: { id: 111 }, chat: privateChat, text: "What is tomorrow's meal plan?" } });
    assert.match(mock.assistantRequests.at(-1).deterministicDraft, new RegExp("Tomorrow \\(.*" + tomorrow));
    assert.match(mock.assistantRequests.at(-1).deterministicDraft, /dinner/i);
    await webhook({ update_id: nextUpdate(), message: { message_id: 9, from: { id: 111 }, chat: privateChat, text: "When is the next burger-compatible date?" } });
    assert.match(mock.assistantRequests.at(-1).deterministicDraft, /burger/i);
    assert.equal(mock.assistantRequests.at(-1).household.timezone, "Europe/Amsterdam");
    assert.equal(mock.assistantRequests.at(-1).household.nextFourteenDays.length, 14);
  });

  await t.test("recipe links create a message-scoped preview and only Save creates a want-to-try dish", async () => {
    const dishesBefore = (await list("dishes")).length;
    const sendsBefore = mock.telegram.filter((call) => call.method === "sendMessage").length;
    await webhook({ update_id: nextUpdate(), message: { message_id: 91, from: { id: 111 }, chat: groupChat, text: "https://youtu.be/abc123xyz99" } });
    assert.equal(mock.telegram.filter((call) => call.method === "sendMessage").length, sendsBefore, "unmentioned group links stay ignored");

    await webhook({ update_id: nextUpdate(), message: { message_id: 92, from: { id: 111 }, chat: privateChat, text: "Try https://youtu.be/abc123xyz99?si=share" } });
    assert.equal(mock.youtubeRequests.length, 1);
    assert.equal(mock.recipeRequests.length, 1);
    assert.equal((await list("dishes")).length, dishesBefore, "preview must not create a dish");
    const importRecord = (await list("recipe_imports")).find((item) => item.canonical_url.includes("abc123xyz99"));
    assert.equal(importRecord.status, "ready");
    const analysisSend = mock.telegram.filter((call) => call.method === "sendMessage").at(-1);
    assert.deepEqual(analysisSend.body.reply_parameters, { message_id: 92 });
    assert.equal(String(analysisSend.result.message_id), importRecord.response_message_id);
    const preview = mock.telegram.filter((call) => call.method === "editMessageText").at(-1);
    assert.equal(preview.body.message_id, analysisSend.result.message_id);
    assert.match(preview.body.text, /Recipe found/);
    assert.match(JSON.stringify(preview.body.reply_markup), /Save to want to try/);

    await webhook({ update_id: nextUpdate(), callback_query: { id: "save-import", from: { id: 111 }, data: `ri:save:${importRecord.id}`, message: { message_id: analysisSend.result.message_id, chat: privateChat } } });
    const saved = (await list("dishes")).find((item) => item.name === "Saved YouTube lentil soup");
    assert.ok(saved);
    assert.equal(saved.lifecycle, "want_to_try");
    assert.equal(saved.source_platform, "youtube");
    assert.equal((await list("recipe_imports")).find((item) => item.id === importRecord.id).status, "saved");
    const saveEdit = mock.telegram.filter((call) => call.method === "editMessageText").at(-1);
    assert.equal(saveEdit.body.message_id, analysisSend.result.message_id);
    assert.match(saveEdit.body.text, /Saved to want to try/);

    const sendsAfter = mock.telegram.filter((call) => call.method === "sendMessage").length;
    await webhook({ update_id: nextUpdate(), callback_query: { id: "saved-list", from: { id: 111 }, data: "nav:saved", message: { message_id: analysisSend.result.message_id, chat: privateChat } } });
    assert.equal(mock.telegram.filter((call) => call.method === "sendMessage").length, sendsAfter);
    assert.match(mock.telegram.filter((call) => call.method === "editMessageText").at(-1).body.text, /Saved YouTube lentil soup/);
  });

  await t.test("recipe details, category confirmation, cancel, and repeated links remain message-scoped", async () => {
    mock.setRecipeCategoryMode("invalid");
    const dishesBefore = (await list("dishes")).length;
    await webhook({ update_id: nextUpdate(), message: { message_id: 93, from: { id: 111 }, chat: privateChat, text: "https://youtu.be/repeat98765" } });
    const firstRecord = (await list("recipe_imports")).filter((item) => item.canonical_url.includes("repeat98765")).at(-1);
    const firstMessageId = Number(firstRecord.response_message_id);
    let preview = mock.telegram.filter((call) => call.method === "editMessageText" && call.body.message_id === firstMessageId).at(-1);
    assert.match(JSON.stringify(preview.body.reply_markup), /Choose category to continue/);
    assert.doesNotMatch(JSON.stringify(preview.body.reply_markup), /Save to want to try/);

    await webhook({ update_id: nextUpdate(), callback_query: { id: "details-import", from: { id: 111 }, data: `ri:details:${firstRecord.id}`, message: { message_id: firstMessageId, chat: privateChat } } });
    assert.match(mock.telegram.filter((call) => call.method === "editMessageText").at(-1).body.text, /Instructions/);
    await webhook({ update_id: nextUpdate(), callback_query: { id: "categories-import", from: { id: 111 }, data: `ri:cats:${firstRecord.id}`, message: { message_id: firstMessageId, chat: privateChat } } });
    const categoryPanel = mock.telegram.filter((call) => call.method === "editMessageText").at(-1);
    const categoryButton = categoryPanel.body.reply_markup.inline_keyboard.flat().find((item) => String(item.callback_data || "").startsWith(`ri:cat:${firstRecord.id}:`));
    assert.ok(categoryButton);
    await webhook({ update_id: nextUpdate(), callback_query: { id: "category-import", from: { id: 111 }, data: categoryButton.callback_data, message: { message_id: firstMessageId, chat: privateChat } } });
    preview = mock.telegram.filter((call) => call.method === "editMessageText").at(-1);
    assert.match(JSON.stringify(preview.body.reply_markup), /Save to want to try/);

    await webhook({ update_id: nextUpdate(), message: { message_id: 94, from: { id: 111 }, chat: privateChat, text: "https://youtu.be/repeat98765?si=again" } });
    const repeated = (await list("recipe_imports")).filter((item) => item.canonical_url.includes("repeat98765"));
    assert.equal(repeated.length, 2);
    assert.notEqual(repeated[0].response_message_id, repeated[1].response_message_id);
    await webhook({ update_id: nextUpdate(), callback_query: { id: "cancel-import", from: { id: 111 }, data: `ri:cancel:${repeated[1].id}`, message: { message_id: Number(repeated[1].response_message_id), chat: privateChat } } });
    assert.equal((await list("recipe_imports")).find((item) => item.id === repeated[1].id).status, "cancelled");
    assert.equal((await list("dishes")).length, dishesBefore);
    mock.setRecipeCategoryMode("valid");
  });

  await t.test("settings enables the weekly reminder destination without exposing old slash commands", async () => {
    await webhook({ update_id: nextUpdate(), message: { message_id: 10, from: { id: 111 }, chat: groupChat, text: "/settings" } });
    await webhook({ update_id: nextUpdate(), callback_query: { id: "daily-on", from: { id: 111 }, data: "set:daily:on", message: { message_id: 101, chat: groupChat } } });
    assert.equal((await list("telegram_chats")).find((item) => item.chat_id === String(groupChat.id)).daily_enabled, true);
    const before = mock.telegram.length;
    await webhook({ update_id: nextUpdate(), message: { message_id: 11, from: { id: 111 }, chat: groupChat, text: "/subscribe" } });
    assert.equal(mock.telegram.length, before);
  });

  await t.test("snoozing pauses notifications for a chosen period and resuming clears it", async () => {
    const settingsMessageId = 101;
    let panel = mock.telegram.filter((call) => call.method === "editMessageText" && call.body.message_id === settingsMessageId).at(-1);
    assert.match(JSON.stringify(panel.body.reply_markup), /"set:snooze:2h"/);
    assert.match(JSON.stringify(panel.body.reply_markup), /"set:snooze:tomorrow"/);
    assert.match(JSON.stringify(panel.body.reply_markup), /"set:snooze:week"/);

    const before = Date.now();
    await webhook({ update_id: nextUpdate(), callback_query: { id: "snooze-2h", from: { id: 111 }, data: "set:snooze:2h", message: { message_id: settingsMessageId, chat: groupChat } } });
    let chat = (await list("telegram_chats")).find((item) => item.chat_id === String(groupChat.id));
    assert.ok(chat.snoozed_until, "snoozed_until is set");
    const snoozedMs = new Date(chat.snoozed_until).getTime() - before;
    assert.ok(snoozedMs > 1.9 * 60 * 60 * 1000 && snoozedMs < 2.1 * 60 * 60 * 1000, "roughly two hours ahead, got " + snoozedMs);
    const confirmSnooze = mock.telegram.filter((call) => call.method === "answerCallbackQuery").at(-1);
    assert.match(confirmSnooze.body.text, /snoozed/i);
    panel = mock.telegram.filter((call) => call.method === "editMessageText" && call.body.message_id === settingsMessageId).at(-1);
    assert.match(panel.body.text, /paused/i);
    assert.doesNotMatch(JSON.stringify(panel.body.reply_markup), /set:snooze:2h|set:snooze:tomorrow|set:snooze:week/);
    assert.match(JSON.stringify(panel.body.reply_markup), /"set:snooze:off"/);
    assert.match(JSON.stringify(panel.body.reply_markup), /Resume notifications now/);

    await webhook({ update_id: nextUpdate(), callback_query: { id: "resume", from: { id: 111 }, data: "set:snooze:off", message: { message_id: settingsMessageId, chat: groupChat } } });
    chat = (await list("telegram_chats")).find((item) => item.chat_id === String(groupChat.id));
    assert.equal(chat.snoozed_until, "");
    const confirmResume = mock.telegram.filter((call) => call.method === "answerCallbackQuery").at(-1);
    assert.match(confirmResume.body.text, /resumed/i);
    panel = mock.telegram.filter((call) => call.method === "editMessageText" && call.body.message_id === settingsMessageId).at(-1);
    assert.doesNotMatch(panel.body.text, /paused/i);
    assert.match(JSON.stringify(panel.body.reply_markup), /"set:snooze:2h"/);

    // Turning the reminder off hides the snooze controls entirely, and back on
    // never lands in a silently snoozed state even if one was set beforehand.
    await webhook({ update_id: nextUpdate(), callback_query: { id: "snooze-week", from: { id: 111 }, data: "set:snooze:week", message: { message_id: settingsMessageId, chat: groupChat } } });
    await webhook({ update_id: nextUpdate(), callback_query: { id: "daily-off", from: { id: 111 }, data: "set:daily:off", message: { message_id: settingsMessageId, chat: groupChat } } });
    panel = mock.telegram.filter((call) => call.method === "editMessageText" && call.body.message_id === settingsMessageId).at(-1);
    assert.doesNotMatch(JSON.stringify(panel.body.reply_markup), /set:snooze/);
    assert.equal((await list("telegram_chats")).find((item) => item.chat_id === String(groupChat.id)).snoozed_until, "");
    await webhook({ update_id: nextUpdate(), callback_query: { id: "daily-on-again", from: { id: 111 }, data: "set:daily:on", message: { message_id: settingsMessageId, chat: groupChat } } });
    chat = (await list("telegram_chats")).find((item) => item.chat_id === String(groupChat.id));
    assert.equal(chat.snoozed_until, "", "re-enabling never lands in a silently snoozed state");
    panel = mock.telegram.filter((call) => call.method === "editMessageText" && call.body.message_id === settingsMessageId).at(-1);
    assert.doesNotMatch(panel.body.text, /paused/i);
  });

  await t.test("meal-change screens show current food and require an explicit Sunday category", async () => {
    // The single-category flow below assumes a non-Sunday date. On the one
    // day in seven where "today" itself is a Sunday, exercise it against
    // tomorrow (always Monday, never the gate) instead, seeding that date's
    // assignment ourselves since only "today" was seeded earlier.
    const changeDay = todayIsSunday ? tomorrow : today;
    if (todayIsSunday) {
      const chosenDish = (await list("dishes"))[0];
      await create("meal_assignments", { date: changeDay, meal: "dinner", dish: chosenDish.id, status: "planned", selection_source: "telegram" });
    }

    // Dinner is the only planned meal, so choosing a date opens the change
    // panel itself instead of a chooser holding a single button.
    await webhook({ update_id: nextUpdate(), callback_query: { id: "change-today", from: { id: 111 }, data: `pick:date:${changeDay}`, message: { message_id: 704, chat: groupChat } } });
    let edit = mock.telegram.filter((call) => call.method === "editMessageText").at(-1);
    assert.match(edit.body.text, new RegExp("Change " + changeDay + " · Dinner"));
    assert.match(edit.body.text, new RegExp((await list("dishes"))[0].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(JSON.stringify(edit.body.reply_markup), /Leftovers/);
    assert.match(JSON.stringify(edit.body.reply_markup), /Not cooking/);
    assert.doesNotMatch(JSON.stringify(edit.body.reply_markup), /do:buy|do:out|do:skip/);

    await webhook({ update_id: nextUpdate(), callback_query: { id: "not-cooking", from: { id: 111 }, data: `do:notcooking:${changeDay}:dinner`, message: { message_id: 704, chat: groupChat } } });
    edit = mock.telegram.filter((call) => call.method === "editMessageText").at(-1);
    assert.match(edit.body.text, /Not cooking/);
    assert.match(JSON.stringify(edit.body.reply_markup), /do:buy/);
    assert.match(JSON.stringify(edit.body.reply_markup), /do:out/);
    assert.match(JSON.stringify(edit.body.reply_markup), /do:skip/);

    await webhook({ update_id: nextUpdate(), callback_query: { id: "change-dinner", from: { id: 111 }, data: `pick:meal:${changeDay}:dinner`, message: { message_id: 704, chat: groupChat } } });
    edit = mock.telegram.filter((call) => call.method === "editMessageText").at(-1);
    assert.match(edit.body.text, /Current: <b>.+<\/b>/);
    assert.match(JSON.stringify(edit.body.reply_markup), /Leftovers/);

    // Search from tomorrow, not today: today itself may already be Sunday
    // (see changeDay above), and picking a category here mutates whichever
    // assignment lives on this date, so it must never land back on today's.
    const sunday = nextWeekday(tomorrow, 0);
    await webhook({ update_id: nextUpdate(), callback_query: { id: "sunday-dinner", from: { id: 111 }, data: `pick:meal:${sunday}:dinner`, message: { message_id: 705, chat: groupChat } } });
    edit = mock.telegram.filter((call) => call.method === "editMessageText").at(-1);
    assert.match(edit.body.text, /Category: <b>choose/);
    assert.doesNotMatch(JSON.stringify(edit.body.reply_markup), /do:suggest/);
    const categoryButton = edit.body.reply_markup.inline_keyboard.flat().find((button) => String(button.callback_data || "").startsWith(`pick:cat:${sunday}:dinner:`));
    assert.ok(categoryButton);
    await webhook({ update_id: nextUpdate(), callback_query: { id: "sunday-category", from: { id: 111 }, data: categoryButton.callback_data, message: { message_id: 705, chat: groupChat } } });
    edit = mock.telegram.filter((call) => call.method === "editMessageText").at(-1);
    assert.match(edit.body.text, /Category: <b>/);
    assert.match(JSON.stringify(edit.body.reply_markup), /do:suggest/);
  });

  await t.test("old planning buttons cannot change past dates", async () => {
    const yesterday = addDays(today, -1);
    const before = (await list("meal_assignments")).filter((item) => item.date === yesterday).length;
    await webhook({ update_id: nextUpdate(), callback_query: { id: "old-leftovers", from: { id: 111 }, data: `do:leftovers:${yesterday}:dinner`, message: { message_id: 706, chat: groupChat } } });
    assert.equal((await list("meal_assignments")).filter((item) => item.date === yesterday).length, before);
    const answer = mock.telegram.filter((call) => call.method === "answerCallbackQuery").at(-1);
    assert.equal(answer.body.show_alert, true);
    assert.match(answer.body.text, /earlier date/);
  });

  let firstSuggestion;
  await t.test("suggestion opens as rich embedded media using a looked-up photo it then caches", async () => {
    const photosBefore = mock.photoRequests.length;
    const suggestionUpdateId = nextUpdate();
    await webhook({ update_id: suggestionUpdateId, callback_query: { id: "suggest", from: { id: 111 }, data: `do:suggest:${planDay}:dinner`, message: { message_id: 101, chat: groupChat } } });
    assert.equal(mock.photoRequests.length, photosBefore + 1, "a Wikipedia hit must not fall through to Openverse");
    assert.match(mock.photoRequests.at(-1), /\/wikipedia\/w\/api\.php\?/);
    const upload = mock.telegram.filter((call) => call.method === "editMessageText" && call.body && call.body.rich_message).at(-1);
    assert.ok(upload, JSON.stringify((await list("telegram_updates")).find((item) => item.update_id === String(suggestionUpdateId))) + "\n" + JSON.stringify(mock.telegram.slice(-8)) + "\n" + logs);
    assert.equal(upload.multipart, undefined, "a photo URL needs no multipart upload");
    assert.equal(upload.body.message_id, 101);
    assert.equal(upload.body.rich_message.media[0].media.media, "https://upload.wikimedia.org/wikipedia/commons/thumb/a/b/Dish.jpg/1000px-Dish.jpg");
    firstSuggestion = (await list("meal_suggestions")).find((item) => item.date === planDay && item.meal === "dinner" && item.outcome === "pending");
    assert.ok(firstSuggestion.telegram_image_file_id);

    const sendsBeforeDetails = mock.telegram.filter((call) => call.method === "sendMessage").length;
    await webhook({ update_id: nextUpdate(), callback_query: { id: "details", from: { id: 111 }, data: `sg:details:${firstSuggestion.id}`, message: { message_id: 101, chat: groupChat, rich_message: {} } } });
    const detailsEdit = mock.telegram.filter((call) => call.method === "editMessageText" && !call.multipart).at(-1);
    assert.equal(detailsEdit.body.message_id, 101);
    assert.match(detailsEdit.body.text, /Suggestion details/);
    assert.equal(detailsEdit.body.rich_message, undefined, "leaving the suggestion view must remove its embedded image");
    assert.equal(mock.telegram.filter((call) => call.method === "sendMessage").length, sendsBeforeDetails);

    await webhook({ update_id: nextUpdate(), callback_query: { id: "card", from: { id: 111 }, data: `sg:card:${firstSuggestion.id}`, message: { message_id: 101, chat: groupChat } } });
    const restored = mock.telegram.filter((call) => call.method === "editMessageText" && call.body && call.body.rich_message).at(-1);
    assert.equal(restored.body.message_id, 101);
    assert.equal(restored.body.rich_message.media[0].media.media, firstSuggestion.telegram_image_file_id);
  });

  let secondSuggestion;
  await t.test("an accepted meal can be changed without creating callback response messages", async () => {
    const firstPhotoCount = mock.photoRequests.length;
    const sendsBeforeAccept = mock.telegram.filter((call) => call.method === "sendMessage").length;
    await webhook({ update_id: nextUpdate(), callback_query: { id: "use-one", from: { id: 111 }, data: `sg:use:${firstSuggestion.id}`, message: { message_id: 101, chat: groupChat, rich_message: {} } } });
    let assignment = (await list("meal_assignments")).find((item) => item.date === planDay && item.meal === "dinner");
    const firstDish = assignment.dish;
    assert.ok(firstDish);
    assert.equal(mock.photoRequests.length, firstPhotoCount, "accepting a cached card must not look its photo up again");
    const acceptedEdit = mock.telegram.filter((call) => call.method === "editMessageText" && !call.multipart).at(-1);
    assert.equal(acceptedEdit.body.message_id, 101);
    assert.equal(acceptedEdit.body.rich_message, undefined, "accepting must remove the suggestion image");
    assert.equal(mock.telegram.filter((call) => call.method === "sendMessage").length, sendsBeforeAccept);

    await webhook({ update_id: nextUpdate(), callback_query: { id: "suggest-two", from: { id: 111 }, data: `do:suggest:${planDay}:dinner`, message: { message_id: 702, chat: groupChat } } });
    const repeatPayload = JSON.parse(mock.mealRequests.at(-1).messages.find((message) => message.role === "user").content);
    assert.ok(repeatPayload.doNotSuggest.dinner.includes(firstSuggestion.suggested_name), "the previous suggestion must be listed as off limits");
    assert.equal(repeatPayload.dishes, undefined, "the whole dish library must not be shipped to the model");
    assert.equal(repeatPayload.feedback, undefined);
    assert.equal(repeatPayload.week, undefined);
    secondSuggestion = (await list("meal_suggestions")).find((item) => item.date === planDay && item.meal === "dinner" && item.outcome === "pending");
    assert.notEqual(secondSuggestion.id, firstSuggestion.id);
    const mediaEdit = mock.telegram.filter((call) => call.method === "editMessageText" && call.body && call.body.rich_message).at(-1);
    assert.ok(mediaEdit);
    assert.equal(mediaEdit.body.message_id, 702);
    await webhook({ update_id: nextUpdate(), callback_query: { id: "use-two", from: { id: 111 }, data: `sg:use:${secondSuggestion.id}`, message: { message_id: 702, chat: groupChat, rich_message: {} } } });
    assignment = (await list("meal_assignments")).find((item) => item.date === planDay && item.meal === "dinner");
    assert.notEqual(assignment.dish, firstDish);
    assert.match((await list("dishes")).find((item) => item.id === assignment.dish).name, /suggestion 2/);
  });

  await t.test("stale suggestion buttons are safe, while Another and text fallback remain usable", async () => {
    const sendsBeforeAnother = mock.telegram.filter((call) => call.method === "sendMessage").length;
    const requestsBeforeStale = mock.mealRequests.length;
    await webhook({ update_id: nextUpdate(), callback_query: { id: "stale-another", from: { id: 111 }, data: `sg:next:${secondSuggestion.id}`, message: { message_id: 702, chat: groupChat, rich_message: {} } } });
    assert.equal(mock.mealRequests.length, requestsBeforeStale);
    const staleAnswer = mock.telegram.filter((call) => call.method === "answerCallbackQuery").at(-1);
    assert.equal(staleAnswer.body.show_alert, true);
    assert.match(staleAnswer.body.text, /no longer active/);

    await webhook({ update_id: nextUpdate(), callback_query: { id: "suggest-three", from: { id: 111 }, data: `do:suggest:${planDay}:dinner`, message: { message_id: 702, chat: groupChat } } });
    const pending = (await list("meal_suggestions")).find((item) => item.date === planDay && item.meal === "dinner" && item.outcome === "pending");
    await webhook({ update_id: nextUpdate(), callback_query: { id: "another", from: { id: 111 }, data: `sg:next:${pending.id}`, message: { message_id: 702, chat: groupChat, rich_message: {} } } });
    assert.ok(mock.telegram.filter((call) => call.method === "editMessageText" && (call.multipart || call.body && call.body.rich_message)).length >= 3);
    assert.equal(mock.telegram.filter((call) => call.method === "sendMessage").length, sendsBeforeAnother);

    mock.failNextPhoto();
    const callsBefore = mock.telegram.length;
    await webhook({ update_id: nextUpdate(), callback_query: { id: "fallback", from: { id: 111 }, data: `do:suggest:${secondPlanDay}:dinner`, message: { message_id: 101, chat: groupChat } } });
    const fallbackCalls = mock.telegram.slice(callsBefore).filter((call) => call.method === "sendMessage" || call.method === "editMessageText");
    assert.ok(fallbackCalls.some((call) => /Suggestion details/.test(call.body.text) && /Use this/.test(JSON.stringify(call.body.reply_markup))));
  });

  await t.test("a typed-in dish is planned with the ingredients the model supplies, without a suggestion", async () => {
    const sendsBefore = mock.telegram.filter((call) => call.method === "sendMessage").length;
    const mealRequestsBefore = mock.mealRequests.length;
    const ingredientRequestsBefore = mock.ingredientRequests.length;
    await webhook({ update_id: nextUpdate(), callback_query: { id: "own", from: { id: 111 }, data: `do:own:${secondPlanDay}:dinner`, message: { message_id: 720, chat: groupChat } } });
    const prompt = mock.telegram.filter((call) => call.method === "sendMessage").at(-1);
    assert.equal(prompt.body.reply_markup.force_reply, true);
    assert.match(prompt.body.text, new RegExp("What are you cooking for " + secondPlanDay + " · Dinner\\?"));
    assert.equal(mock.telegram.filter((call) => call.method === "sendMessage").length, sendsBefore + 1);

    await webhook({ update_id: nextUpdate(), message: {
      message_id: 721,
      from: { id: 111 },
      chat: groupChat,
      text: "  Nan   panir   sabzi ",
      reply_to_message: { message_id: prompt.result.message_id, from: { id: 5, is_bot: true, username: "moghassemi_family_assistant_bot" }, text: prompt.body.text },
    } });
    assert.equal(mock.mealRequests.length, mealRequestsBefore, "typing a dish must not ask for a suggestion");
    assert.equal(mock.ingredientRequests.length, ingredientRequestsBefore + 1, "the shopping list needs the dish ingredients");
    assert.equal(mock.ingredientRequests.at(-1).dishName, "Nan panir sabzi");
    assert.equal(mock.ingredientRequests.at(-1).servings.includesBaby, true);
    const assignment = (await list("meal_assignments")).find((item) => item.date === secondPlanDay && item.meal === "dinner");
    assert.equal(assignment.status, "planned");
    assert.equal(assignment.selection_source, "telegram");
    const dish = (await list("dishes")).find((item) => item.id === assignment.dish);
    assert.equal(dish.name, "Nan panir sabzi", "whitespace is normalized before the dish is stored");
    assert.equal(dish.lifecycle, "regular");
    assert.deepEqual(dish.ingredients, ["500 g main ingredient", "1 onion", "2 tbsp olive oil"]);
    const confirmation = mock.telegram.filter((call) => call.method === "sendMessage").at(-1);
    assert.match(confirmation.body.text, /Nan panir sabzi<\/b> is planned/);
    assert.doesNotMatch(confirmation.body.text, /500 g main ingredient|Ingredients|🛒/, "the confirmation no longer echoes ingredients back into the chat");

    // A reply to anything else must still be treated as an ordinary question.
    await webhook({ update_id: nextUpdate(), message: {
      message_id: 722,
      from: { id: 111 },
      chat: groupChat,
      text: "And what about lunch?",
      reply_to_message: { message_id: 700, from: { id: 5, is_bot: true, username: "moghassemi_family_assistant_bot" }, text: "🏠 Household assistant" },
    } });
    assert.equal(mock.assistantRequests.at(-1).question, "And what about lunch?");
  });

  await t.test("a dish the model does not know is not planned until the ingredients arrive", async () => {
    await webhook({ update_id: nextUpdate(), callback_query: { id: "own-unknown", from: { id: 111 }, data: `do:own:${thirdPlanDay}:dinner`, message: { message_id: 730, chat: groupChat } } });
    const namePrompt = mock.telegram.filter((call) => call.method === "sendMessage").at(-1);
    await webhook({ update_id: nextUpdate(), message: {
      message_id: 731,
      from: { id: 111 },
      chat: groupChat,
      text: "Unknown grandma casserole",
      reply_to_message: { message_id: namePrompt.result.message_id, from: { id: 5, is_bot: true, username: "moghassemi_family_assistant_bot" }, text: namePrompt.body.text },
    } });
    assert.equal((await list("meal_assignments")).filter((item) => item.date === thirdPlanDay).length, 0, "an unknown dish is never planned blind");
    const ingredientPrompt = mock.telegram.filter((call) => call.method === "sendMessage").at(-1);
    assert.equal(ingredientPrompt.body.reply_markup.force_reply, true);
    assert.match(ingredientPrompt.body.text, new RegExp("Ingredients for Unknown grandma casserole · " + thirdPlanDay + " · Dinner\\?"));

    await webhook({ update_id: nextUpdate(), message: {
      message_id: 732,
      from: { id: 111 },
      chat: groupChat,
      text: "- 1 kg potatoes\n• 300 g cheese, 2 onions",
      reply_to_message: { message_id: ingredientPrompt.result.message_id, from: { id: 5, is_bot: true, username: "moghassemi_family_assistant_bot" }, text: ingredientPrompt.body.text },
    } });
    const assignment = (await list("meal_assignments")).find((item) => item.date === thirdPlanDay && item.meal === "dinner");
    assert.equal(assignment.status, "planned");
    const dish = (await list("dishes")).find((item) => item.id === assignment.dish);
    assert.equal(dish.name, "Unknown grandma casserole");
    assert.deepEqual(dish.ingredients, ["1 kg potatoes", "300 g cheese", "2 onions"]);
    assert.doesNotMatch(mock.telegram.filter((call) => call.method === "sendMessage").at(-1).body.text, /1 kg potatoes|Ingredients|🛒/, "the confirmation no longer echoes ingredients back into the chat");
  });

  await t.test("a plan update from the weekly message returns to the weekly message", async () => {
    await webhook({ update_id: nextUpdate(), callback_query: { id: "week-day", from: { id: 111 }, data: `pick:meal:${planDay}:dinner:w`, message: { message_id: 740, chat: groupChat } } });
    let edit = mock.telegram.filter((call) => call.method === "editMessageText").at(-1);
    const back = edit.body.reply_markup.inline_keyboard.at(-1)[0];
    assert.equal(back.callback_data, "nav:planweek", "back from the weekly flow stays in the weekly flow");
    await webhook({ update_id: nextUpdate(), callback_query: { id: "week-out", from: { id: 111 }, data: `do:out:${planDay}:dinner:w`, message: { message_id: 740, chat: groupChat } } });
    edit = mock.telegram.filter((call) => call.method === "editMessageText").at(-1);
    assert.match(edit.body.text, /Dinners for the week/, "the weekly plan is redrawn instead of the home dashboard");
  });

  await t.test("a past date cannot be planned through the own-dish reply", async () => {
    const yesterday = addDays(today, -1);
    const before = (await list("meal_assignments")).filter((item) => item.date === yesterday).length;
    await webhook({ update_id: nextUpdate(), message: {
      message_id: 723,
      from: { id: 111 },
      chat: groupChat,
      text: "Lasagne",
      reply_to_message: { message_id: 719, from: { id: 5, is_bot: true, username: "moghassemi_family_assistant_bot" }, text: `✍️ What are you cooking for ${yesterday} · Dinner?` },
    } });
    assert.equal((await list("meal_assignments")).filter((item) => item.date === yesterday).length, before);
    assert.match(mock.telegram.filter((call) => call.method === "sendMessage").at(-1).body.text, /earlier date/);
  });

  await t.test("Leftovers stores only a neutral state and never guesses a dish", async () => {
    await webhook({ update_id: nextUpdate(), callback_query: { id: "leftovers", from: { id: 111 }, data: `do:leftovers:${tomorrow}:dinner`, message: { message_id: 707, chat: groupChat } } });
    const assignment = (await list("meal_assignments")).find((item) => item.date === tomorrow && item.meal === "dinner");
    assert.equal(assignment.status, "leftovers");
    assert.equal(assignment.dish, "");
    const edit = mock.telegram.filter((call) => call.method === "editMessageText").at(-1);
    assert.match(edit.body.text, /Dinner<\/b> — <i>Left over<\/i>/);
  });

  let occurrence;
  await t.test("button feedback and the next user photo retain existing behavior", async () => {
    const dish = (await list("dishes"))[0];
    // Today's dinner was already seeded by the assistant test, and one
    // assignment per date and meal is all the schema allows.
    const assignment = (await list("meal_assignments")).find((item) => item.date === today && item.meal === "dinner")
      || await create("meal_assignments", { date: today, meal: "dinner", dish: dish.id, status: "planned", selection_source: "telegram" });
    const sendsBeforeFeedbackButton = mock.telegram.filter((call) => call.method === "sendMessage").length;
    await webhook({ update_id: nextUpdate(), callback_query: { id: "feedback", from: { id: 111 }, data: `fa:liked:${assignment.id}`, message: { message_id: 703, chat: groupChat } } });
    occurrence = (await list("cooked_occurrences")).find((item) => item.date === today && item.meal === "dinner");
    assert.ok(occurrence);
    assert.ok((await list("telegram_conversations")).find((item) => item.telegram_user === alexTelegram.id));
    assert.equal(mock.telegram.filter((call) => call.method === "sendMessage").length, sendsBeforeFeedbackButton);
    assert.equal(mock.telegram.filter((call) => call.method === "editMessageText").at(-1).body.message_id, 703);
    const sendsBeforePhoto = mock.telegram.filter((call) => call.method === "sendMessage").length;
    await webhook({
      update_id: nextUpdate(),
      message: { message_id: 20, from: { id: 111 }, chat: groupChat, photo: [{ file_id: "small", file_unique_id: "small", file_size: 10 }, { file_id: "large", file_unique_id: "large", file_size: 500 }] },
    });
    const photo = (await list("meal_photos")).find((item) => item.occurrence === occurrence.id);
    assert.ok(photo);
    const photoResponse = mock.telegram.filter((call) => call.method === "sendMessage").at(-1);
    assert.equal(mock.telegram.filter((call) => call.method === "sendMessage").length, sendsBeforePhoto + 1);
    assert.match(photoResponse.body.text, /Photo saved/);
    assert.deepEqual(photoResponse.body.reply_parameters, { message_id: 20 });
  });

  await t.test("public website data stays read-only while assistant storage remains private", async () => {
    assert.equal((await fetch(baseUrl + "/api/collections/meal_assignments/records?perPage=100")).status, 200);
    assert.equal((await fetch(baseUrl + "/api/collections/meal_suggestions/records?perPage=100")).status, 403);
    assert.equal((await fetch(baseUrl + "/api/collections/meal_feedback/records?perPage=100")).status, 403);
  });

  assert.equal(logs.includes(BOT_TOKEN), false);
  assert.equal(logs.includes("test-openrouter-key"), false);
  assert.match(logs, /Telegram received \(Alex from Home\): \/start/);
  assert.match(logs, /Telegram action \(Alex from Home\): sent home dashboard/);
});
