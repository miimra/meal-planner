"use strict";

function first(app, filter, sort, params) {
  const records = app.findRecordsByFilter("github_sync_commits", filter, sort || "", 1, 0, params || {});
  return records.length ? records[0] : null;
}

function hasProcessed(app, repository, commitSha) {
  return Boolean(first(
    app,
    "repository = {:repository} && commit_sha = {:commit}",
    "",
    { repository, commit: commitSha },
  ));
}

function latestProcessedCommit(app, repository) {
  const record = first(app, "repository = {:repository}", "-created", { repository });
  return record ? record.getString("commit_sha") : "";
}

function recordProcessed(app, repository, commitSha, files, summary) {
  const record = new Record(app.findCollectionByNameOrId("github_sync_commits"));
  record.set("repository", repository);
  record.set("commit_sha", commitSha);
  record.set("files", files);
  record.set("summary", summary);
  app.save(record);
  return record;
}

module.exports = { hasProcessed, latestProcessedCommit, recordProcessed };
