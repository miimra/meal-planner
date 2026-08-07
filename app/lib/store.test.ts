import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryPatchToBody, mapCategoryRecord, mapDishRecord } from "./store.ts";

test("mapCategoryRecord converts a PocketBase record into a Category", () => {
  const category = mapCategoryRecord({
    id: "pbid1",
    catId: 5,
    name_en: "International Chicken/Meat",
    name_fa: "مرغ/گوشت بین‌المللی",
    emoji: "🍗",
    style: "international",
    effort: "medium",
    effort_min: 30,
    effort_max: 45,
  });
  assert.equal(category.pbId, "pbid1");
  assert.equal(category.catId, 5);
  assert.deepEqual(category.effort_minutes, [30, 45]);
  assert.equal(category.weekend_only, undefined);
});

test("mapCategoryRecord keeps weekend_only/notes when set", () => {
  const category = mapCategoryRecord({
    id: "pbid2",
    catId: 2,
    name_en: "Iranian Grilled",
    name_fa: "کبابی ایرانی",
    emoji: "🍢",
    style: "iranian",
    effort: "medium",
    effort_min: 30,
    effort_max: 45,
    weekend_only: true,
    notes: "weekend only",
  });
  assert.equal(category.weekend_only, true);
  assert.equal(category.notes, "weekend only");
});

test("mapDishRecord attaches lastCooked from the local map by dish id", () => {
  const dish = mapDishRecord(
    { id: "d1", catId: 5, name: "Butter Chicken" },
    { d1: "2026-08-07" }
  );
  assert.equal(dish.categoryId, 5);
  assert.equal(dish.lastCooked, "2026-08-07");
});

test("mapDishRecord leaves lastCooked undefined when not in the local map", () => {
  const dish = mapDishRecord({ id: "d2", catId: 5, name: "Teriyaki" }, {});
  assert.equal(dish.lastCooked, undefined);
});

test("categoryPatchToBody sends notes: '' (not omitted) when clearing notes", () => {
  const body = categoryPatchToBody({ notes: "" });
  assert.equal(body.notes, "");
  assert.ok("notes" in body);
});

test("categoryPatchToBody sends notes: '' when notes is present but undefined (the shape a caller could still produce)", () => {
  const body = categoryPatchToBody({ notes: undefined });
  assert.equal(body.notes, "");
  assert.ok("notes" in body);
});

test("categoryPatchToBody omits notes entirely when the patch doesn't touch it", () => {
  const body = categoryPatchToBody({ name_en: "Renamed" });
  assert.equal("notes" in body, false);
});

test("categoryPatchToBody still splits effort_minutes into effort_min/effort_max", () => {
  const body = categoryPatchToBody({ effort_minutes: [10, 20] });
  assert.equal(body.effort_min, 10);
  assert.equal(body.effort_max, 20);
  assert.equal("effort_minutes" in body, false);
});
