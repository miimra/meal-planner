"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

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

async function startPocketBase(t, identity) {
  const pocketbase = findPocketBase();
  if (!pocketbase) {
    t.skip("set POCKETBASE_BIN to run PocketBase integration tests");
    return null;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "build-identity-"));
  const hooksDir = path.join(tempDir, "pb_hooks");
  fs.cpSync(path.join(ROOT, "pb_hooks"), hooksDir, { recursive: true });
  if (identity) {
    fs.writeFileSync(
      path.join(hooksDir, "build_identity.js"),
      `module.exports = Object.freeze(${JSON.stringify(identity)});\n`,
    );
  }

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(pocketbase, [
    "serve", "--dir", path.join(tempDir, "pb_data"),
    "--hooksDir", hooksDir,
    "--publicDir", path.join(tempDir, "public"),
    "--http", `127.0.0.1:${port}`,
    "--automigrate=false", "--hooksWatch=false", "--dev=false",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });
  t.after(async () => {
    if (child.exitCode === null) {
      await new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill("SIGTERM");
      });
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  let lastHealthResponse = "no response";
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) assert.fail(`PocketBase exited before starting\n${logs}`);
    try {
      const response = await fetch(baseUrl + "/api/health");
      if (response.ok) return baseUrl;
      lastHealthResponse = `${response.status} ${await response.text()}`;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`PocketBase did not start (${lastHealthResponse})\n${logs}`);
}

async function json(baseUrl, pathname) {
  const response = await fetch(baseUrl + pathname);
  assert.equal(response.status, 200);
  return response.json();
}

test("PocketBase exposes injected build identity consistently", { timeout: 15_000 }, async (t) => {
  const identity = {
    service: "meal-planner",
    version: "0.1.0+2.abc1234",
    commit: "0123456789abcdef0123456789abcdef01234567",
    builtAt: "2026-10-16T02:30:00Z",
  };
  const baseUrl = await startPocketBase(t, identity);
  if (!baseUrl) return;

  const version = await json(baseUrl, "/version");
  const versionAgain = await json(baseUrl, "/version");
  const apiVersion = await json(baseUrl, "/api/version");
  const health = await json(baseUrl, "/api/health");

  assert.deepEqual(version, identity);
  assert.deepEqual(versionAgain, identity);
  assert.deepEqual(apiVersion, identity);
  assert.deepEqual(Object.fromEntries(Object.keys(identity).map((key) => [key, health[key]])), identity);
  assert.deepEqual(Object.keys(health).sort(), ["builtAt", "code", "commit", "data", "message", "service", "version"]);
  assert.equal(health.message, "API is healthy.");
  assert.equal(health.code, 200);
  assert.deepEqual(health.data, {});
});

test("PocketBase uses development identity without injected metadata", { timeout: 15_000 }, async (t) => {
  const baseUrl = await startPocketBase(t);
  if (!baseUrl) return;

  const version = await json(baseUrl, "/version");
  const apiVersion = await json(baseUrl, "/api/version");
  const health = await json(baseUrl, "/api/health");

  assert.deepEqual(version, {
    service: "meal-planner",
    version: "development",
    commit: "development",
    builtAt: "development",
  });
  assert.deepEqual(apiVersion, version);
  assert.deepEqual(Object.fromEntries(Object.keys(version).map((key) => [key, health[key]])), version);
});
