"use strict";

function dateDistance(from, to) {
  const fromTime = Date.parse(String(from || "") + "T00:00:00Z");
  const toTime = Date.parse(String(to || "") + "T00:00:00Z");
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return null;
  return Math.floor((toTime - fromTime) / (24 * 60 * 60 * 1000));
}

function feedbackSignal(items) {
  let score = 0;
  let liked = 0;
  let okay = 0;
  let disliked = 0;
  for (const item of items || []) {
    if (item.rating === "liked") {
      liked += 1;
      score += 3;
    } else if (item.rating === "okay") {
      okay += 1;
      score += 1;
    } else if (item.rating === "disliked") {
      disliked += 1;
      score -= 4;
    } else if (item.makeAgain === "yes") {
      score += 3;
    } else if (item.makeAgain === "maybe") {
      score += 1;
    } else if (item.makeAgain === "no") {
      score -= 4;
    }
  }
  return { score, liked, okay, disliked };
}

function rankCandidates(dishes, options) {
  const settings = options || {};
  const categoryIds = (settings.categoryIds || (settings.categoryId ? [settings.categoryId] : []))
    .map(Number)
    .filter((item) => Boolean(item));
  const assigned = new Set(settings.assignedDishIds || []);
  const feedbackByDish = {};
  const cookedByDish = {};

  for (const item of settings.feedback || []) {
    if (!item.dishId) continue;
    if (!feedbackByDish[item.dishId]) feedbackByDish[item.dishId] = [];
    feedbackByDish[item.dishId].push(item);
  }
  for (const item of settings.occurrences || []) {
    if (!item.dishId || !item.date) continue;
    const current = cookedByDish[item.dishId];
    if (!current || String(item.date) > current) cookedByDish[item.dishId] = String(item.date);
  }

  return (dishes || []).filter((dish) => {
    if (!dish || !dish.id || dish.lifecycle === "archived") return false;
    if (assigned.has(dish.id)) return false;
    if (dish.lifecycle === "want_to_try" && settings.meal) {
      if (Array.isArray(dish.mealTypes) && dish.mealTypes.length && dish.mealTypes.indexOf(settings.meal) === -1) return false;
      if (settings.meal !== "dinner" && (
        dish.difficulty && dish.difficulty !== "easy"
        || Number(dish.prepMinutes || 0) + Number(dish.cookMinutes || 0) > 20
        || Array.isArray(dish.ingredients) && dish.ingredients.length > 8
      )) return false;
    }
    return !categoryIds.length || categoryIds.indexOf(Number(dish.categoryId)) !== -1;
  }).map((dish) => {
    const feedback = feedbackSignal(feedbackByDish[dish.id]);
    const lastCooked = cookedByDish[dish.id] || null;
    const daysSinceCooked = dateDistance(lastCooked, settings.targetDate);
    let score = feedback.score;
    const signals = [];

    if (dish.lifecycle === "want_to_try" && !lastCooked) {
      score += 2;
      signals.push("saved_untried");
    }
    if (feedback.liked) signals.push("liked:" + feedback.liked);
    if (feedback.okay) signals.push("okay:" + feedback.okay);
    if (feedback.disliked) signals.push("disliked:" + feedback.disliked);
    if (daysSinceCooked !== null && daysSinceCooked >= 0) {
      if (daysSinceCooked <= 14) score -= 4;
      else if (daysSinceCooked <= 30) score -= 2;
      else if (daysSinceCooked <= 60) score -= 1;
      if (daysSinceCooked <= 60) signals.push("recently_cooked:" + daysSinceCooked + "d");
    }

    return {
      id: dish.id,
      name: dish.name,
      lifecycle: dish.lifecycle,
      score,
      signals,
      lastCooked,
    };
  }).sort((left, right) => (
    right.score - left.score
    || String(left.name).localeCompare(String(right.name))
    || String(left.id).localeCompare(String(right.id))
  ));
}

function isEligibleCandidate(candidates, meal, dishId) {
  if (!dishId) return true;
  return ((candidates && candidates[meal]) || []).some((candidate) => candidate.id === dishId);
}

function useStoredDishDetails(dishes, item) {
  if (!item.existingDishId) return item;
  const dish = (dishes || []).find((candidate) => candidate.id === item.existingDishId);
  if (!dish) return item;
  return {
    ...item,
    name: dish.name,
    difficulty: dish.difficulty || item.difficulty,
    prepMinutes: Number.isInteger(dish.prepMinutes) ? dish.prepMinutes : item.prepMinutes,
    cookMinutes: Number.isInteger(dish.cookMinutes) ? dish.cookMinutes : item.cookMinutes,
    ingredients: Array.isArray(dish.ingredients) && dish.ingredients.length ? dish.ingredients : item.ingredients,
  };
}

module.exports = { feedbackSignal, isEligibleCandidate, rankCandidates, useStoredDishDetails };
