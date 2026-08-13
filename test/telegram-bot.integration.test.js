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
  const assistantRequests = [];
  const imageRequests = [];
  const recipeRequests = [];
  const youtubeRequests = [];
  let recipeCategoryMode = "valid";
  let messageId = 100;
  let mealSequence = 0;
  let imageSequence = 0;
  let failImages = 0;
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

    if (request.url === "/openrouter/images") {
      imageRequests.push(body);
      if (failImages > 0) {
        failImages -= 1;
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "temporary" }));
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [{ b64_json: jpeg.toString("base64"), media_type: "image/jpeg" }] }));
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
        if (call.multipart && /name="rich_message"/.test(bodyText)) {
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
    assistantRequests,
    imageRequests,
    recipeRequests,
    youtubeRequests,
    failNextImage() { failImages += 1; },
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
    OPENROUTER_IMAGE_MODEL: "test/image-model",
    OPENROUTER_BASE_URL: mock.baseUrl + "/openrouter",
    TELEGRAM_API_BASE_URL: mock.baseUrl,
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_BOT_USERNAME: "moghassemi_family_assistant_bot",
    TELEGRAM_WEBHOOK_SECRET: SECRET,
    YOUTUBE_API_KEY: "test-youtube-key",
    YOUTUBE_API_BASE_URL: mock.baseUrl + "/youtube",
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

  await t.test("startup registers exactly four visible commands", () => {
    const registration = mock.telegram.find((call) => call.method === "setMyCommands");
    assert.deepEqual(registration.body.commands.map((item) => item.command), ["home", "meals", "ask", "settings"]);
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
  const groupChat = { id: -100123, type: "group", title: "Onze huis" };
  const privateChat = { id: 111, type: "private", first_name: "Amir" };

  assert.equal((await webhook({ update_id: 1 }, "wrong-secret")).status, 404);
  await t.test("unauthorized users are silent", async () => {
    const before = mock.telegram.length;
    await webhook({ update_id: 2, message: { message_id: 1, from: { id: 999 }, chat: { id: 999, type: "private" }, text: "What is tomorrow?" } });
    assert.equal(mock.telegram.length, before);
    assert.equal((await list("telegram_updates")).find((item) => item.update_id === "2").status, "ignored");
  });

  const members = await list("household_members");
  const amir = members.find((member) => member.name === "Amir");
  const maryam = members.find((member) => member.name === "Maryam");
  const amirTelegram = await create("telegram_users", { telegram_user_id: "111", member: amir.id, active: true });
  await create("telegram_users", { telegram_user_id: "222", member: maryam.id, active: true });

  await t.test("each user message gets a new response while buttons edit only their originating message", async () => {
    await webhook({ update_id: nextUpdate(), message: { message_id: 2, from: { id: 111, first_name: "Amir" }, chat: groupChat, text: "/start" } });
    await webhook({ update_id: nextUpdate(), message: { message_id: 3, from: { id: 111 }, chat: groupChat, text: "/meals" } });
    const sent = mock.telegram.filter((call) => call.method === "sendMessage").slice(-2);
    assert.equal(sent.length, 2);
    assert.deepEqual(sent.map((call) => call.body.reply_parameters), [{ message_id: 2 }, { message_id: 3 }]);
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
  await t.test("tomorrow-plan and burger-date answers are grounded in deterministic stored facts", async () => {
    await webhook({ update_id: nextUpdate(), message: { message_id: 8, from: { id: 111 }, chat: privateChat, text: "What is tomorrow's meal plan?" } });
    assert.match(mock.assistantRequests.at(-1).deterministicDraft, new RegExp("Tomorrow \\(.*" + tomorrow));
    assert.match(mock.assistantRequests.at(-1).deterministicDraft, /breakfast.*lunch.*dinner/i);
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

  await t.test("settings enables the single daily destination without exposing old slash commands", async () => {
    await webhook({ update_id: nextUpdate(), message: { message_id: 10, from: { id: 111 }, chat: groupChat, text: "/settings" } });
    await webhook({ update_id: nextUpdate(), callback_query: { id: "daily-on", from: { id: 111 }, data: "set:daily:on", message: { message_id: 101, chat: groupChat } } });
    assert.equal((await list("telegram_chats")).find((item) => item.chat_id === String(groupChat.id)).daily_enabled, true);
    const before = mock.telegram.length;
    await webhook({ update_id: nextUpdate(), message: { message_id: 11, from: { id: 111 }, chat: groupChat, text: "/subscribe" } });
    assert.equal(mock.telegram.length, before);
  });

  let firstSuggestion;
  await t.test("suggestion opens lazily as rich embedded media and caches its image", async () => {
    const imagesBefore = mock.imageRequests.length;
    const suggestionUpdateId = nextUpdate();
    await webhook({ update_id: suggestionUpdateId, callback_query: { id: "suggest", from: { id: 111 }, data: `do:suggest:${tomorrow}:lunch`, message: { message_id: 101, chat: groupChat } } });
    assert.equal(mock.imageRequests.length, imagesBefore + 1);
    assert.equal(mock.imageRequests.at(-1).aspect_ratio, "1:1");
    assert.equal(mock.imageRequests.at(-1).output_format, "jpeg");
    assert.match(mock.imageRequests.at(-1).prompt, /no text/i);
    const upload = mock.telegram.filter((call) => call.method === "editMessageText" && call.multipart).at(-1);
    assert.ok(upload, JSON.stringify((await list("telegram_updates")).find((item) => item.update_id === String(suggestionUpdateId))) + "\n" + JSON.stringify(mock.telegram.slice(-8)) + "\n" + logs);
    assert.equal(upload.multipart, true);
    assert.match(upload.raw, /suggestion/);
    assert.match(upload.raw, /rich_message/);
    assert.match(upload.raw, /name="message_id"\r\n\r\n101/);
    firstSuggestion = (await list("meal_suggestions")).find((item) => item.date === tomorrow && item.meal === "lunch" && item.outcome === "pending");
    assert.ok(firstSuggestion.generated_image);
    assert.equal(firstSuggestion.generated_image_model, "test/image-model");
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
    const firstImageCount = mock.imageRequests.length;
    const sendsBeforeAccept = mock.telegram.filter((call) => call.method === "sendMessage").length;
    await webhook({ update_id: nextUpdate(), callback_query: { id: "use-one", from: { id: 111 }, data: `sg:use:${firstSuggestion.id}`, message: { message_id: 101, chat: groupChat, rich_message: {} } } });
    let assignment = (await list("meal_assignments")).find((item) => item.date === tomorrow && item.meal === "lunch");
    const firstDish = assignment.dish;
    assert.ok(firstDish);
    assert.equal(mock.imageRequests.length, firstImageCount, "accepting a cached card must not regenerate its image");
    const acceptedEdit = mock.telegram.filter((call) => call.method === "editMessageText" && !call.multipart).at(-1);
    assert.equal(acceptedEdit.body.message_id, 101);
    assert.equal(acceptedEdit.body.rich_message, undefined, "accepting must remove the suggestion image");
    assert.equal(mock.telegram.filter((call) => call.method === "sendMessage").length, sendsBeforeAccept);

    await webhook({ update_id: nextUpdate(), callback_query: { id: "suggest-two", from: { id: 111 }, data: `do:suggest:${tomorrow}:lunch`, message: { message_id: 702, chat: groupChat } } });
    secondSuggestion = (await list("meal_suggestions")).find((item) => item.date === tomorrow && item.meal === "lunch" && item.outcome === "pending");
    assert.notEqual(secondSuggestion.id, firstSuggestion.id);
    const mediaEdit = mock.telegram.filter((call) => call.method === "editMessageText" && call.multipart).at(-1);
    assert.ok(mediaEdit);
    assert.equal(mediaEdit.multipart, true);
    assert.match(mediaEdit.raw, /name="message_id"\r\n\r\n702/);
    await webhook({ update_id: nextUpdate(), callback_query: { id: "use-two", from: { id: 111 }, data: `sg:use:${secondSuggestion.id}`, message: { message_id: 702, chat: groupChat, rich_message: {} } } });
    assignment = (await list("meal_assignments")).find((item) => item.date === tomorrow && item.meal === "lunch");
    assert.notEqual(assignment.dish, firstDish);
    assert.match((await list("dishes")).find((item) => item.id === assignment.dish).name, /suggestion 2/);
  });

  await t.test("Another replaces embedded media and text-only fallback remains usable when image generation fails", async () => {
    const sendsBeforeAnother = mock.telegram.filter((call) => call.method === "sendMessage").length;
    await webhook({ update_id: nextUpdate(), callback_query: { id: "another", from: { id: 111 }, data: `sg:next:${secondSuggestion.id}`, message: { message_id: 702, chat: groupChat, rich_message: {} } } });
    assert.ok(mock.telegram.filter((call) => call.method === "editMessageText" && (call.multipart || call.body && call.body.rich_message)).length >= 3);
    assert.equal(mock.telegram.filter((call) => call.method === "sendMessage").length, sendsBeforeAnother);

    mock.failNextImage();
    const callsBefore = mock.telegram.length;
    await webhook({ update_id: nextUpdate(), callback_query: { id: "fallback", from: { id: 111 }, data: `do:suggest:${tomorrow}:breakfast`, message: { message_id: 101, chat: groupChat } } });
    const fallbackCalls = mock.telegram.slice(callsBefore).filter((call) => call.method === "sendMessage" || call.method === "editMessageText");
    assert.ok(fallbackCalls.some((call) => /Suggestion details/.test(call.body.text) && /Use this/.test(JSON.stringify(call.body.reply_markup))));
  });

  let occurrence;
  await t.test("button feedback and the next user photo retain existing behavior", async () => {
    const dish = (await list("dishes"))[0];
    const assignment = await create("meal_assignments", { date: today, meal: "dinner", dish: dish.id, status: "planned", selection_source: "telegram" });
    const sendsBeforeFeedbackButton = mock.telegram.filter((call) => call.method === "sendMessage").length;
    await webhook({ update_id: nextUpdate(), callback_query: { id: "feedback", from: { id: 111 }, data: `fa:liked:${assignment.id}`, message: { message_id: 703, chat: groupChat } } });
    occurrence = (await list("cooked_occurrences")).find((item) => item.date === today && item.meal === "dinner");
    assert.ok(occurrence);
    assert.ok((await list("telegram_conversations")).find((item) => item.telegram_user === amirTelegram.id));
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
  assert.match(logs, /Telegram received \(Amir from Onze huis\): \/start/);
  assert.match(logs, /Telegram action \(Amir from Onze huis\): sent home dashboard/);
});
