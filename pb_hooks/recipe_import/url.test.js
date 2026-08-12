"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const url = require("./url.js");

test("extracts and canonicalizes public recipe URLs", () => {
  assert.equal(url.extractFirstUrl("Try https://Example.com/food/?utm_source=x&b=2&a=1."), "https://Example.com/food/?utm_source=x&b=2&a=1");
  assert.equal(url.canonicalize("https://Example.com:443/food/?utm_source=x&b=2&a=1#method"), "https://example.com/food?a=1&b=2");
  assert.equal(url.canonicalize("https://youtu.be/dQw4w9WgXcQ?si=share"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(url.platform("https://www.instagram.com/reel/abc/"), "instagram");
});

test("rejects credentials, local names, unusual numeric hosts, and private addresses", () => {
  const values = [
    "file:///etc/passwd", "https://user:pass@example.com/x", "http://localhost/x",
    "http://service.internal/x", "http://127.0.0.1/x", "http://127.1/x",
    "http://10.0.0.1/x", "http://0177.0.0.1/x", "http://0x7f000001/x", "http://169.254.169.254/x", "http://[::1]/x",
    "http://[fd00::1]/x", "ftp://example.com/x",
    "https://example.com:8090/private",
  ];
  for (const value of values) assert.throws(() => url.assertSafe(value), /(invalid|unsafe)_source_url/);
  assert.throws(() => url.assertSafe("https://public.example.org/x", ["93.184.216.34", "10.0.0.2"]), /unsafe_source_url/);
});

test("relative redirects are resolved and must be validated again", () => {
  assert.equal(url.resolve("https://example.org/a/b", "../recipe?id=2"), "https://example.org/recipe?id=2");
  assert.throws(() => url.resolve("https://example.org/a", "http://127.0.0.1/secret"), /unsafe_source_url/);
});
