"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const auth = require("./auth.js");

const TOKEN = "t".repeat(40);

function deps() {
  const calls = [];
  return {
    calls,
    sha256: (v) => crypto.createHash("sha256").update(v).digest("hex"),
    equal: (a, b) => { calls.push([a, b]); return a === b; },
  };
}

test("token is compared through the constant-time equal function on digests", () => {
  const d = deps();
  assert.equal(auth.isAuthorized("Bearer " + TOKEN, TOKEN, d), true);
  assert.equal(d.calls.length, 1);
  assert.equal(d.calls[0][0], d.sha256(TOKEN));
  assert.notEqual(d.calls[0][0], TOKEN);
});

test("wrong, missing and malformed credentials are rejected", () => {
  const d = deps();
  assert.equal(auth.isAuthorized("Bearer " + "x".repeat(40), TOKEN, d), false);
  assert.equal(auth.isAuthorized("Bearer short", TOKEN, d), false);
  assert.equal(auth.isAuthorized("", TOKEN, d), false);
  assert.equal(auth.isAuthorized(undefined, TOKEN, d), false);
  assert.equal(auth.isAuthorized("Basic " + TOKEN, TOKEN, d), false);
  assert.equal(auth.isAuthorized("Bearer ", TOKEN, d), false);
});

test("missing or short configured token disables MCP and never authorizes", () => {
  const d = deps();
  assert.equal(auth.isEnabled(""), false);
  assert.equal(auth.isEnabled(undefined), false);
  assert.equal(auth.isEnabled("a".repeat(31)), false);
  assert.equal(auth.isEnabled("a".repeat(32)), true);
  assert.equal(auth.isAuthorized("Bearer short", "short", d), false);
  assert.equal(d.calls.length, 0);
});

test("auth module never compares against the secret with == or ===", () => {
  const source = fs.readFileSync(path.join(__dirname, "auth.js"), "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  assert.ok(source.includes("$security.equal"));
  const secretLines = source.split("\n").filter((line) => /configuredToken|provided|expected/.test(line));
  assert.ok(secretLines.length > 0);
  for (const line of secretLines) assert.equal(/[=!]==?(?!>)/.test(line), false, line);
});
