const test = require("node:test");
const assert = require("node:assert/strict");
const github = require("./github_client.js");

function env(values) {
  return github.environment((name) => values[name] || "");
}

test("public repository configuration does not require a GitHub token", () => {
  const config = env({
    MEAL_DATA_GITHUB_OWNER: "owner",
    MEAL_DATA_GITHUB_REPO: "repo",
  });
  assert.equal(config.branch, "master");
  assert.equal(config.root, "meal-data");
  assert.equal(config.token, "");
});

test("private repository requests use the configured read token without logging it", () => {
  const config = env({
    MEAL_DATA_GITHUB_OWNER: "owner",
    MEAL_DATA_GITHUB_REPO: "repo",
    MEAL_DATA_GITHUB_TOKEN: "secret-token",
  });
  let request;
  const client = github.createClient(config, (value) => {
    request = value;
    return {
      statusCode: 200,
      json: { sha: "1".repeat(40), commit: { tree: { sha: "a".repeat(40) } } },
    };
  });
  client.latestCommit();
  assert.equal(request.headers.Authorization, "Bearer secret-token");
  assert.equal(request.url.includes("secret-token"), false);
});

test("unsafe repository roots are rejected", () => {
  assert.throws(() => env({
    MEAL_DATA_GITHUB_OWNER: "owner",
    MEAL_DATA_GITHUB_REPO: "repo",
    MEAL_DATA_GITHUB_ROOT: "../meal-data",
  }), /safe repository-relative path/);
});
