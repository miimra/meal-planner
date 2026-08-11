const test = require("node:test");
const assert = require("node:assert/strict");
const lib = require("./lib.js");
const { bearerToken, userOrAssistantMiddleware } = require("./auth.js");

test("weekBounds is strictly Monday through Sunday at a Monday boundary", () => {
  assert.deepEqual(lib.weekBounds("2026-08-10"), {
    start: "2026-08-10",
    end: "2026-08-16",
  });
});

test("weekBounds is strictly Monday through Sunday at a Sunday boundary", () => {
  assert.deepEqual(lib.weekBounds("2026-08-16"), {
    start: "2026-08-10",
    end: "2026-08-16",
  });
});

test("weekBounds crosses month and year boundaries without local-time drift", () => {
  assert.deepEqual(lib.weekBounds("2027-01-01"), {
    start: "2026-12-28",
    end: "2027-01-03",
  });
});

test("parseDate rejects impossible dates", () => {
  assert.throws(() => lib.parseDate("2026-02-30"), /real calendar date/);
});

test("assertMeal accepts only the three supported meals", () => {
  for (const meal of ["breakfast", "lunch", "dinner"]) assert.equal(lib.assertMeal(meal), meal);
  assert.throws(() => lib.assertMeal("snack"), /breakfast, lunch, dinner/);
});

test("dinnerRotation mirrors the existing two-week schedule", () => {
  assert.deepEqual(lib.dinnerRotation("2026-08-10"), {
    kind: "category",
    rotationWeek: 1,
    catId: 5,
  });
  assert.equal(lib.dinnerRotation("2026-08-15").kind, "eat-out");
  assert.deepEqual(lib.dinnerRotation("2026-08-16").choiceCatIds, [2, 3]);
});

test("bearerToken parses only the Bearer authorization scheme", () => {
  assert.equal(bearerToken("Bearer abc123"), "abc123");
  assert.equal(bearerToken("Basic abc123"), "");
  assert.equal(bearerToken(undefined), "");
});

test("GitHub sync middleware accepts authenticated users", () => {
  let continued = false;
  const result = userOrAssistantMiddleware({
    auth: { collection: () => ({ name: "users" }) },
    next() {
      continued = true;
      return "next";
    },
  });

  assert.equal(result, "next");
  assert.equal(continued, true);
});
