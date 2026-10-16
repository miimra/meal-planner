"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "release-version.sh");

function git(directory, args) {
  const result = spawnSync("git", args, { cwd: directory, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function releaseVersion(directory, commit) {
  return spawnSync("bash", [SCRIPT, commit], { cwd: directory, encoding: "utf8" });
}

function createRepository(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-version-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  git(directory, ["init", "-q"]);
  git(directory, ["config", "user.email", "tests@example.invalid"]);
  git(directory, ["config", "user.name", "Release Version Test"]);
  fs.writeFileSync(path.join(directory, "identity.txt"), "initial\n");
  git(directory, ["add", "identity.txt"]);
  git(directory, ["commit", "-qm", "initial release"]);
  return directory;
}

test("release version uses the reachable tag and commit distance", (t) => {
  const directory = createRepository(t);
  const taggedCommit = git(directory, ["rev-parse", "HEAD"]);
  git(directory, ["tag", "v0.1.0", taggedCommit]);

  const tagged = releaseVersion(directory, taggedCommit);
  assert.equal(tagged.status, 0, tagged.stderr);
  assert.equal(tagged.stdout.trim(), "0.1.0");

  fs.writeFileSync(path.join(directory, "identity.txt"), "later\n");
  git(directory, ["commit", "-am", "later change", "-q"]);
  const laterCommit = git(directory, ["rev-parse", "HEAD"]);
  const later = releaseVersion(directory, laterCommit);
  assert.equal(later.status, 0, later.stderr);
  assert.equal(later.stdout.trim(), `0.1.0+1.${laterCommit.slice(0, 12)}`);
});

test("release version refuses commits without a release tag anchor", (t) => {
  const directory = createRepository(t);
  const result = releaseVersion(directory, git(directory, ["rev-parse", "HEAD"]));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No reachable release tag anchors/);
});
