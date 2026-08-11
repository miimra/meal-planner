"use strict";

const paths = require(`${typeof __hooks === "undefined" ? "." : __hooks + "/github_sync"}/paths.js`);

const API_VERSION = "2026-03-10";
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

function responseText(body) {
  if (typeof toString === "function") return toString(body, MAX_DOCUMENT_BYTES);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(body)) return body.toString("utf8");
  return String(body);
}

function environment(getenv) {
  const read = getenv || ((name) => $os.getenv(name));
  const owner = String(read("MEAL_DATA_GITHUB_OWNER") || "").trim();
  const repo = String(read("MEAL_DATA_GITHUB_REPO") || "").trim();
  if (!owner || !repo) {
    const error = new Error("MEAL_DATA_GITHUB_OWNER and MEAL_DATA_GITHUB_REPO are required");
    error.name = "SyncConfigurationError";
    error.status = 503;
    throw error;
  }
  return {
    owner,
    repo,
    branch: String(read("MEAL_DATA_GITHUB_BRANCH") || "master").trim(),
    root: paths.normalizeRoot(read("MEAL_DATA_GITHUB_ROOT") || "meal-data"),
    token: String(read("MEAL_DATA_GITHUB_TOKEN") || read("GITHUB_TOKEN") || "").trim(),
    apiBase: String(read("MEAL_DATA_GITHUB_API_URL") || "https://api.github.com").replace(/\/+$/, ""),
  };
}

function encodePath(value) {
  return String(value).split("/").map(encodeURIComponent).join("/");
}

function createClient(config, send) {
  const httpSend = send || ((request) => $http.send(request));
  const repositoryPath = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;

  function request(path, options) {
    const requestOptions = options || {};
    const headers = {
      Accept: requestOptions.accept || "application/vnd.github+json",
      "User-Agent": "meal-planner-pocketbase-sync",
      "X-GitHub-Api-Version": API_VERSION,
    };
    if (config.token) headers.Authorization = `Bearer ${config.token}`;
    const response = httpSend({
      url: config.apiBase + path,
      method: "GET",
      headers,
      timeout: 30,
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      const error = new Error(`GitHub request failed with ${response.statusCode} for ${path}`);
      error.name = "GitHubRequestError";
      error.status = 502;
      error.githubStatus = response.statusCode;
      throw error;
    }
    return response;
  }

  function requestJson(path) {
    const response = request(path);
    if (response.json !== null && typeof response.json !== "undefined") return response.json;
    return JSON.parse(responseText(response.body));
  }

  function latestCommit() {
    const data = requestJson(`${repositoryPath}/commits/${encodeURIComponent(config.branch)}`);
    if (!data.sha || !data.commit || !data.commit.tree || !data.commit.tree.sha) {
      throw new Error("GitHub latest commit response did not include commit and tree SHAs");
    }
    return { sha: data.sha, treeSha: data.commit.tree.sha };
  }

  function fullTree(treeSha) {
    const data = requestJson(`${repositoryPath}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`);
    if (data.truncated) {
      const error = new Error("GitHub repository tree is truncated; meal-data cannot be synchronized safely");
      error.status = 502;
      throw error;
    }
    return (data.tree || [])
      .filter((item) => item.type === "blob")
      .map((item) => ({ filename: item.path, status: "added" }));
  }

  function changedFiles(previousSha, latest) {
    if (!previousSha) return { files: fullTree(latest.treeSha), fullScan: true };
    try {
      const data = requestJson(
        `${repositoryPath}/compare/${encodeURIComponent(previousSha)}...${encodeURIComponent(latest.sha)}`,
      );
      if (!Array.isArray(data.files)) throw new Error("compare response has no files list");
      return {
        files: data.files.map((file) => ({
          filename: file.filename,
          previousFilename: file.previous_filename || null,
          status: file.status,
        })),
        fullScan: false,
      };
    } catch (error) {
      return { files: fullTree(latest.treeSha), fullScan: true, compareError: error.message };
    }
  }

  function fetchDocument(filename, commitSha) {
    const response = request(
      `${repositoryPath}/contents/${encodePath(filename)}?ref=${encodeURIComponent(commitSha)}`,
      { accept: "application/vnd.github.raw+json" },
    );
    const text = responseText(response.body);
    try {
      return JSON.parse(text);
    } catch (_) {
      const error = new Error(`Malformed JSON in ${filename}`);
      error.name = "SchemaValidationError";
      error.status = 422;
      throw error;
    }
  }

  return { changedFiles, fetchDocument, latestCommit };
}

module.exports = { API_VERSION, createClient, encodePath, environment };
