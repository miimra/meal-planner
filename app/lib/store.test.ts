import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCategoryRecord, mapDishRecord } from "./store.ts";

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
