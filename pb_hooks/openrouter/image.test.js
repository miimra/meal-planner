"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const image = require("./image.js");

const jpeg = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);
const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x04, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

test("image responses accept one signature-matching JPEG or WebP", () => {
  const jpegResult = image.validateImageResponse({ data: [{ b64_json: jpeg.toString("base64"), media_type: "image/jpeg" }] });
  assert.deepEqual(jpegResult.bytes, [...jpeg]);
  assert.equal(jpegResult.extension, "jpg");
  const webpResult = image.validateImageResponse({ data: [{ b64_json: webp.toString("base64"), media_type: "image/webp" }] });
  assert.equal(webpResult.extension, "webp");
});

test("image responses reject malformed, mismatched, unsafe, or multiple outputs", () => {
  assert.throws(() => image.validateImageResponse({ data: [] }), /invalid_image_response/);
  assert.throws(() => image.validateImageResponse({ data: [
    { b64_json: jpeg.toString("base64"), media_type: "image/jpeg" },
    { b64_json: jpeg.toString("base64"), media_type: "image/jpeg" },
  ] }), /invalid_image_response/);
  assert.throws(() => image.validateImageResponse({ data: [{ b64_json: "not base64", media_type: "image/jpeg" }] }), /invalid_image_response/);
  assert.throws(() => image.validateImageResponse({ data: [{ b64_json: jpeg.toString("base64"), media_type: "image/webp" }] }), /invalid_image_response/);
  assert.throws(() => image.validateImageResponse({ data: [{ b64_json: jpeg.toString("base64"), media_type: "image/svg+xml" }] }), /invalid_image_response/);
});
