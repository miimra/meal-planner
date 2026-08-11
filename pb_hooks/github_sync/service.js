"use strict";

const base = typeof __hooks === "undefined" ? "." : `${__hooks}/github_sync`;
const github = require(`${base}/github_client.js`);
const mapper = require(`${base}/mapper.js`);
const paths = require(`${base}/paths.js`);
const state = require(`${base}/state.js`);
const validator = require(`${base}/validator.js`);

function log(app, level, message, attributes) {
  const pairs = [];
  for (const key of Object.keys(attributes || {})) pairs.push(key, attributes[key]);
  app.logger()[level](message, ...pairs);
}

function prepareDocuments(client, changed, config, commitSha, app) {
  const documents = [];
  const deleted = [];
  const skipped = [];
  const identities = { suggestion: {}, feedback: {} };

  for (const file of changed) {
    const classification = paths.classifyPath(file.filename, config.root);
    if (classification.kind === "ignored" || classification.kind === "schema") {
      skipped.push(file.filename);
      continue;
    }
    if (file.status === "removed") {
      deleted.push(file.filename);
      log(app, "warn", "GitHub meal sync preserved deleted source data", { path: file.filename });
      continue;
    }

    const data = client.fetchDocument(file.filename, commitSha);
    validator.assertValid(classification.kind, data, file.filename);
    paths.assertPathMatches(classification, data, file.filename);
    if (classification.kind === "day") {
      collectStableIds(data, file.filename, identities);
    }
    documents.push({ kind: classification.kind, path: file.filename, data });
  }
  return { deleted, documents, skipped };
}

function collectStableIds(day, filename, identities) {
  for (const mealName of ["breakfast", "lunch", "dinner"]) {
    for (const suggestion of day.meals[mealName].suggestions) {
      assertUniqueIdentity("suggestion", suggestion.id, filename, identities);
    }
    for (const feedback of day.meals[mealName].feedback) {
      assertUniqueIdentity("feedback", feedback.id, filename, identities);
    }
  }
}

function assertUniqueIdentity(kind, id, filename, identities) {
  if (identities[kind][id]) {
    const error = new Error(
      `${kind} id ${id} appears in both ${identities[kind][id]} and ${filename}`,
    );
    error.name = "SchemaValidationError";
    error.status = 422;
    throw error;
  }
  identities[kind][id] = filename;
}

function run(app, options) {
  const trigger = (options && options.trigger) || "manual";
  let config;
  let lockId = "";
  let lockKey = "";
  try {
    config = github.environment(options && options.getenv);
    const repository = `${config.owner}/${config.repo}`;
    lockId = $security.randomString(24);
    lockKey = `github-meal-sync:${repository}`;
    if (app.store().getOrSet(lockKey, () => lockId) !== lockId) {
      const error = new Error("A GitHub meal sync is already running");
      error.name = "SyncInProgressError";
      error.status = 409;
      throw error;
    }
    const client = (options && options.client) || github.createClient(config);
    log(app, "info", "GitHub meal sync started", { repository, trigger });

    const latest = client.latestCommit();
    log(app, "info", "GitHub meal sync source commit", { commit: latest.sha, repository });
    if (state.hasProcessed(app, repository, latest.sha)) {
      log(app, "info", "GitHub meal sync skipped processed commit", { commit: latest.sha, repository });
      return { status: "unchanged", trigger, repository, commit: latest.sha };
    }

    const previous = state.latestProcessedCommit(app, repository);
    const comparison = client.changedFiles(previous, latest);
    log(app, "info", "GitHub meal sync files changed", {
      commit: latest.sha,
      count: comparison.files.length,
      fullScan: comparison.fullScan,
    });
    const prepared = prepareDocuments(client, comparison.files, config, latest.sha, app);
    log(app, "info", "GitHub meal sync files prepared", {
      deleted: prepared.deleted.length,
      imported: prepared.documents.length,
      skipped: prepared.skipped.length,
    });
    let summary;
    app.runInTransaction((tx) => {
      summary = mapper.applyDocuments(tx, prepared.documents, latest.sha);
      summary.filesImported = prepared.documents.length;
      summary.filesDeleted = prepared.deleted.length;
      summary.filesSkipped = prepared.skipped.length;
      summary.fullScan = comparison.fullScan;
      state.recordProcessed(tx, repository, latest.sha, {
        imported: prepared.documents.map((document) => document.path),
        deleted: prepared.deleted,
        skipped: prepared.skipped,
      }, summary);
    });

    log(app, "info", "GitHub meal sync completed", {
      commit: latest.sha,
      days: summary.daysUpserted,
      feedback: summary.feedbackUpserted,
      recipes: summary.recipesUpserted,
      repository,
    });
    return { status: "completed", trigger, repository, commit: latest.sha, summary };
  } catch (error) {
    log(app, "error", "GitHub meal sync failed", {
      error: error.message,
      repository: config ? `${config.owner}/${config.repo}` : "unconfigured",
      trigger,
    });
    throw error;
  } finally {
    if (lockKey && app.store().get(lockKey) === lockId) app.store().remove(lockKey);
  }
}

function runForRequest(app) {
  try {
    return run(app, { trigger: "manual" });
  } catch (error) {
    if (error.name === "SchemaValidationError" || error.name === "SourceMappingError") {
      throw new BadRequestError(error.message);
    }
    if (error.name === "SyncInProgressError") throw new ApiError(409, error.message);
    if (error.name === "SyncConfigurationError") throw new InternalServerError(error.message);
    if (error.name === "GitHubRequestError") throw new ApiError(502, error.message);
    throw error;
  }
}

module.exports = { prepareDocuments, run, runForRequest };
