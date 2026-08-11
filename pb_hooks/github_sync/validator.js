"use strict";

const SCHEMA_FILES = {
  day: "day.schema.json",
  recipe: "recipe.schema.json",
  household: "household.schema.json",
};

let schemaCache = null;

function schemaDirectory() {
  if (typeof __hooks !== "undefined") return `${__hooks}/../meal-data/schema`;
  const path = require("node:path");
  return path.resolve(__dirname, "../../meal-data/schema");
}

function readText(filename) {
  if (typeof $os !== "undefined") return toString($os.readFile(filename), 2 * 1024 * 1024);
  return require("node:fs").readFileSync(filename, "utf8");
}

function schemas() {
  if (schemaCache) return schemaCache;
  const base = schemaDirectory();
  schemaCache = {};
  for (const kind of Object.keys(SCHEMA_FILES)) {
    schemaCache[kind] = JSON.parse(readText(`${base}/${SCHEMA_FILES[kind]}`));
  }
  return schemaCache;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function actualType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function typeMatches(value, expected) {
  if (Array.isArray(expected)) return expected.some((type) => typeMatches(value, type));
  if (expected === "number") return typeof value === "number" && Number.isFinite(value);
  if (expected === "integer") return Number.isInteger(value);
  if (expected === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return actualType(value) === expected;
}

function pointer(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported schema reference: ${ref}`);
  let current = root;
  for (const encoded of ref.slice(2).split("/")) {
    const part = encoded.replace(/~1/g, "/").replace(/~0/g, "~");
    current = current[part];
  }
  return current;
}

function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

function validDateTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

function validUri(value) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/.test(value);
}

function checkFormat(value, format) {
  if (typeof value !== "string") return true;
  if (format === "date") return validDate(value);
  if (format === "date-time") return validDateTime(value);
  if (format === "uri") return validUri(value);
  return true;
}

function validateNode(value, schema, root, path, errors) {
  if (schema.$ref) {
    validateNode(value, pointer(root, schema.$ref), root, path, errors);
    return;
  }

  if (schema.oneOf) {
    let matches = 0;
    for (const option of schema.oneOf) {
      const optionErrors = [];
      validateNode(value, option, root, path, optionErrors);
      if (optionErrors.length === 0) matches += 1;
    }
    if (matches !== 1) errors.push(`${path} must match exactly one allowed shape`);
    return;
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const") && !sameValue(value, schema.const)) {
    errors.push(`${path} must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((item) => sameValue(item, value))) {
    errors.push(`${path} must be one of: ${schema.enum.join(", ")}`);
  }
  if (schema.type && !typeMatches(value, schema.type)) {
    const expected = Array.isArray(schema.type) ? schema.type.join(" or ") : schema.type;
    errors.push(`${path} must be ${expected}`);
    return;
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path} must not be empty`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) {
      errors.push(`${path} does not match ${schema.pattern}`);
    }
    if (schema.format && !checkFormat(value, schema.format)) {
      errors.push(`${path} must use ${schema.format} format`);
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path} must be at least ${schema.minimum}`);
    }
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      errors.push(`${path} must be greater than ${schema.exclusiveMinimum}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path} must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.uniqueItems) {
      const seen = {};
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen[key]) errors.push(`${path} must contain unique items`);
        seen[key] = true;
      }
    }
    if (schema.items) {
      value.forEach((item, index) => validateNode(item, schema.items, root, `${path}[${index}]`, errors));
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) {
        errors.push(`${path}.${required} is required`);
      }
    }
    const properties = schema.properties || {};
    for (const key of Object.keys(value)) {
      if (properties[key]) {
        validateNode(value[key], properties[key], root, `${path}.${key}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}.${key} is not allowed`);
      }
    }
  }
}

function semanticDay(data, errors) {
  const suggestionIds = {};
  const feedbackIds = {};
  for (const mealName of ["breakfast", "lunch", "dinner"]) {
    const meal = data.meals && data.meals[mealName];
    if (!meal) continue;
    if (meal.status === "unplanned" && meal.plannedRecipeId !== null) {
      errors.push(`$.meals.${mealName}.plannedRecipeId must be null when unplanned`);
    }
    if (meal.status === "planned" && meal.plannedRecipeId === null) {
      errors.push(`$.meals.${mealName}.plannedRecipeId is required when planned`);
    }
    if (meal.status === "cooked" && meal.cooked === null) {
      errors.push(`$.meals.${mealName}.cooked is required when status is cooked`);
    }
    if (meal.status !== "cooked" && meal.cooked !== null) {
      errors.push(`$.meals.${mealName}.status must be cooked when cooked data is present`);
    }
    if (meal.status === "eating_out" && (meal.plannedRecipeId !== null || meal.cooked !== null)) {
      errors.push(`$.meals.${mealName} cannot plan or cook a home recipe when eating_out`);
    }
    for (const suggestion of meal.suggestions || []) {
      if (suggestionIds[suggestion.id]) errors.push(`suggestion id ${suggestion.id} is duplicated`);
      suggestionIds[suggestion.id] = true;
    }
    for (const feedback of meal.feedback || []) {
      if (feedbackIds[feedback.id]) errors.push(`feedback id ${feedback.id} is duplicated`);
      feedbackIds[feedback.id] = true;
    }
  }
}

function semanticRecipe(data, errors) {
  for (let index = 0; index < (data.steps || []).length; index += 1) {
    if (data.steps[index].order !== index + 1) {
      errors.push(`$.steps[${index}].order must be ${index + 1}`);
    }
  }
}

function semanticHousehold(data, errors) {
  const memberIds = {};
  for (const member of data.members || []) {
    if (memberIds[member.id]) errors.push(`household member id ${member.id} is duplicated`);
    memberIds[member.id] = true;
  }
}

function validate(kind, data) {
  const schema = schemas()[kind];
  if (!schema) throw new Error(`unknown schema kind: ${kind}`);
  const errors = [];
  validateNode(data, schema, schema, "$", errors);
  if (errors.length === 0) {
    if (kind === "day") semanticDay(data, errors);
    if (kind === "recipe") semanticRecipe(data, errors);
    if (kind === "household") semanticHousehold(data, errors);
  }
  return { valid: errors.length === 0, errors };
}

function assertValid(kind, data, sourcePath) {
  const result = validate(kind, data);
  if (!result.valid) {
    const error = new Error(`Invalid ${kind} document ${sourcePath || ""}: ${result.errors.join("; ")}`);
    error.name = "SchemaValidationError";
    error.status = 422;
    error.validationErrors = result.errors;
    throw error;
  }
  return data;
}

module.exports = { assertValid, validDate, validDateTime, validate };
