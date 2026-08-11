const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const paths = require("./paths.js");
const validator = require("./validator.js");

const ROOT = path.resolve(__dirname, "../..");

function fixture(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
}

test("valid day.json passes Draft 2020-12 schema validation", () => {
  const day = fixture("meal-data/days/2026/08/2026-08-12/day.json");
  assert.deepEqual(validator.validate("day", day), { valid: true, errors: [] });
});

test("invalid day.json is rejected", () => {
  const day = fixture("meal-data/days/2026/08/2026-08-12/day.json");
  delete day.meals.dinner;
  const result = validator.validate("day", day);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /dinner is required/);
});

test("valid recipe passes schema validation", () => {
  const recipe = fixture("meal-data/recipes/lemon-herb-salmon.json");
  assert.equal(validator.validate("recipe", recipe).valid, true);
});

test("invalid recipe id is rejected", () => {
  const recipe = fixture("meal-data/recipes/lemon-herb-salmon.json");
  recipe.id = "Not A Slug";
  const result = validator.validate("recipe", recipe);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /does not match/);
});

test("household document validates member identities and preferences", () => {
  const household = fixture("meal-data/household.json");
  assert.equal(validator.validate("household", household).valid, true);
  household.members.push({ id: "amir", name: "Duplicate", active: true });
  assert.match(validator.validate("household", household).errors.join(" "), /duplicated/);
});

test("Monday and Sunday day paths preserve real calendar dates", () => {
  for (const date of ["2026-08-10", "2026-08-16"]) {
    const classification = paths.classifyPath(
      `meal-data/days/2026/08/${date}/day.json`,
      "meal-data",
    );
    assert.equal(classification.kind, "day");
    assert.doesNotThrow(() => paths.assertPathMatches(classification, { date }, date));
    assert.equal(validator.validDate(date), true);
  }
});

test("additional fields fail validation when the schema forbids them", () => {
  const day = fixture("meal-data/days/2026/08/2026-08-12/day.json");
  day.meals.dinner.unexpected = true;
  const result = validator.validate("day", day);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /unexpected is not allowed/);
});

test("day folder and document date must agree", () => {
  const classification = paths.classifyPath(
    "meal-data/days/2026/08/2026-08-12/day.json",
    "meal-data",
  );
  assert.throws(
    () => paths.assertPathMatches(classification, { date: "2026-08-13" }, "day.json"),
    /does not match its folder/,
  );
});

test("semantic status and ordered recipe step rules are enforced", () => {
  const day = fixture("meal-data/days/2026/08/2026-08-12/day.json");
  day.meals.breakfast.status = "planned";
  assert.match(validator.validate("day", day).errors.join(" "), /required when planned/);

  const recipe = fixture("meal-data/recipes/lemon-herb-salmon.json");
  recipe.steps[1].order = 3;
  assert.match(validator.validate("recipe", recipe).errors.join(" "), /must be 2/);
});
