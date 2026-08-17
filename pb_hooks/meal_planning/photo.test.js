"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const photo = require("./photo.js");

test("only plain https image URLs are handed to Telegram", () => {
  assert.ok(photo.usable("https://upload.wikimedia.org/wikipedia/commons/thumb/a/b/G.JPG/1000px-G.JPG?utm_source=x"));
  assert.ok(photo.usable("https://live.staticflickr.com/191/497293505_5b8490998d_b.jpg"));
  assert.ok(!photo.usable("https://api.openverse.org/v1/images/76ba580b/thumb/"));
  assert.ok(!photo.usable("https://commons.wikimedia.org/x/Logo.svg"));
  assert.ok(!photo.usable("http://upload.wikimedia.org/x.jpg"));
  assert.ok(!photo.usable(""));
});
