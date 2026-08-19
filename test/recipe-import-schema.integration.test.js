"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

function findPocketBase() {
  if (process.env.POCKETBASE_BIN && fs.existsSync(process.env.POCKETBASE_BIN)) {
    return process.env.POCKETBASE_BIN;
  }
  const lookup = spawnSync("sh", ["-c", "command -v pocketbase"], { encoding: "utf8" });
  return lookup.status === 0 ? lookup.stdout.trim() : "";
}

function runPocketBase(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    ...options,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result;
}

function exportCollections(binary, dataDir, hooksDir, parentDir, suffix) {
  const exportDir = path.join(parentDir, `export-${suffix}`);
  fs.mkdirSync(exportDir);
  runPocketBase(binary, [
    "migrate", "collections",
    "--dir", dataDir,
    "--migrationsDir", exportDir,
    "--hooksDir", hooksDir,
    "--dev=false",
  ], { input: "y\n" });
  const filename = fs.readdirSync(exportDir).find((name) => name.endsWith("_collections_snapshot.js"));
  assert.ok(filename, "PocketBase should generate a collection snapshot");
  const source = fs.readFileSync(path.join(exportDir, filename), "utf8");
  const prefix = "  const snapshot = ";
  const start = source.indexOf(prefix);
  const end = source.indexOf(";\n\n  return app.importCollections", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return JSON.parse(source.slice(start + prefix.length, end));
}

function fieldMap(collection) {
  return new Map(collection.fields.map((field) => [field.name, field]));
}

test("recipe link import migration is private, complete, and reversible", { timeout: 30_000 }, (t) => {
  const pocketbase = findPocketBase();
  if (!pocketbase) {
    t.skip("set POCKETBASE_BIN to run PocketBase migration tests");
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "recipe-import-schema-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const dataDir = path.join(tempDir, "data");
  const hooksDir = path.join(tempDir, "hooks");
  fs.mkdirSync(hooksDir);

  runPocketBase(pocketbase, [
    "migrate", "up",
    "--dir", dataDir,
    "--migrationsDir", path.join(ROOT, "pb_migrations"),
    "--hooksDir", hooksDir,
    "--dev=false",
  ]);

  const migrated = exportCollections(pocketbase, dataDir, hooksDir, tempDir, "up");
  const imports = migrated.find((collection) => collection.name === "recipe_imports");
  assert.ok(imports);
  assert.equal(imports.listRule, null);
  assert.equal(imports.viewRule, null);
  assert.equal(imports.createRule, null);
  assert.equal(imports.updateRule, null);
  assert.equal(imports.deleteRule, null);

  const importFields = fieldMap(imports);
  assert.deepEqual(
    [...importFields.keys()]
      .filter((name) => !["id", "created", "updated"].includes(name))
      .sort(),
    [
      "canonical_url", "chat_id", "confidence", "dish", "error",
      "extracted_recipe", "missing_fields", "model", "platform",
      "requested_by", "response_message_id", "source_description",
      "source_metadata", "source_title", "source_url", "status",
    ].sort(),
  );
  assert.equal(importFields.get("source_url").type, "url");
  assert.equal(importFields.get("canonical_url").required, true);
  assert.deepEqual(importFields.get("platform").values, ["web", "youtube", "instagram", "other"]);
  assert.deepEqual(importFields.get("status").values, [
    "pending", "processing", "needs_input", "ready", "saved", "failed", "cancelled",
  ]);
  assert.equal(importFields.get("requested_by").required, true);
  assert.equal(importFields.get("extracted_recipe").maxSize, 500000);
  assert.equal(importFields.get("confidence").min, 0);
  assert.equal(importFields.get("confidence").max, 1);
  assert.ok(imports.indexes.some((index) => index.includes("idx_recipe_imports_canonical_url")));
  assert.equal(imports.indexes.some((index) => /UNIQUE INDEX idx_recipe_imports_canonical_url/.test(index)), false);
  assert.ok(imports.indexes.some((index) => index.includes("idx_recipe_imports_status_created")));

  const dishes = migrated.find((collection) => collection.name === "dishes");
  const dishFields = fieldMap(dishes);
  assert.deepEqual(dishFields.get("lifecycle").values, ["regular", "want_to_try", "archived"]);
  assert.equal(dishFields.get("lifecycle").required, true);
  assert.equal(dishFields.get("source_url").type, "url");
  assert.deepEqual(dishFields.get("source_platform").values, ["web", "youtube", "instagram", "other"]);
  assert.equal(dishFields.get("source_import").collectionId, imports.id);
  assert.equal(dishFields.get("source_import").hidden, true);

  const assignments = migrated.find((collection) => collection.name === "meal_assignments");
  assert.ok(fieldMap(assignments).get("status").values.includes("leftovers"));

  // Roll back everything applied after the recipe-import migration, so adding a
  // later migration does not silently change what this test reverts.
  const migrationFiles = fs.readdirSync(path.join(ROOT, "pb_migrations")).filter((name) => name.endsWith(".js")).sort();
  const depth = migrationFiles.length - migrationFiles.indexOf("1786886400_recipe_link_imports.js");

  runPocketBase(pocketbase, [
    "migrate", "down", String(depth),
    "--dir", dataDir,
    "--migrationsDir", path.join(ROOT, "pb_migrations"),
    "--hooksDir", hooksDir,
    "--dev=false",
  ], { input: "y\n" });

  const reverted = exportCollections(pocketbase, dataDir, hooksDir, tempDir, "down");
  assert.equal(reverted.some((collection) => collection.name === "recipe_imports"), false);
  const revertedDishes = fieldMap(reverted.find((collection) => collection.name === "dishes"));
  for (const name of ["lifecycle", "source_url", "source_platform", "source_import"]) {
    assert.equal(revertedDishes.has(name), false);
  }
});
