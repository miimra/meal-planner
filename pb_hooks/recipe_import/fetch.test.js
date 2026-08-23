"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fetcher = require("./fetch.js");

test("bounded fetch validates DNS and every explicit redirect", () => {
  const resolved = [];
  const requested = [];
  const result = fetcher.fetchPage("https://example.org/start", {
    resolve(host) { resolved.push(host); return [host === "cdn.example.org" ? "93.184.216.35" : "93.184.216.34"]; },
    transport(request) {
      requested.push(request);
      if (request.url === "https://example.org/start") return { statusCode: 302, headers: { Location: ["https://cdn.example.org/recipe"] }, body: [] };
      return { statusCode: 200, headers: { "Content-Type": ["text/html; charset=utf-8"], "Content-Length": ["13"] }, raw: "<h1>Food</h1>" };
    },
  });
  assert.deepEqual(resolved, ["example.org", "cdn.example.org"]);
  assert.equal(requested.every((item) => item.followRedirects === false), true);
  assert.deepEqual(requested.map((item) => item.resolvedAddresses), [["93.184.216.34"], ["93.184.216.35"]]);
  assert.equal(result.url, "https://cdn.example.org/recipe");
  assert.equal(result.body, "<h1>Food</h1>");
});

test("bounded fetch rejects private redirect targets and oversized/unsupported content", () => {
  const resolve = () => ["93.184.216.34"];
  assert.throws(() => fetcher.fetchPage("https://example.org/start", {
    resolve,
    transport: () => ({ statusCode: 302, headers: { location: ["http://169.254.169.254/latest"] }, body: [] }),
  }), /unsafe_source_url/);
  assert.throws(() => fetcher.fetchPage("https://example.org/start", {
    resolve,
    maxBytes: 5,
    transport: () => ({ statusCode: 200, headers: { "content-type": ["text/html"] }, raw: "123456" }),
  }), /source_too_large/);
  assert.throws(() => fetcher.fetchPage("https://example.org/start", {
    resolve,
    transport: () => ({ statusCode: 200, headers: { "content-type": ["application/octet-stream"] }, raw: "x" }),
  }), /unsupported_source_type/);
});

test("safe fetch fails closed without a resolver and no-follow transport", () => {
  assert.throws(() => fetcher.fetchPage("https://example.org/recipe"), /safe_fetch_dependencies_required/);
});
