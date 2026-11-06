"use strict";

// Constant-time bearer token check for the MCP endpoint. Both values are hashed
// first so the comparison leaks neither content nor length, and the comparison
// itself is delegated to $security.equal (or an injected equivalent in tests).

const MIN_TOKEN_LENGTH = 32;
const BEARER_PATTERN = /^Bearer +(.+)$/i;

function defaultDeps() {
  return {
    equal: function (a, b) { return $security.equal(a, b); },
    sha256: function (value) { return $security.sha256(value); },
  };
}

// MCP is only available when a sufficiently long token is configured.
function isEnabled(configuredToken) {
  return String(configuredToken || "").length >= MIN_TOKEN_LENGTH;
}

function bearerToken(authorizationHeader) {
  const match = BEARER_PATTERN.exec(String(authorizationHeader || ""));
  return match ? match[1].trim() : "";
}

function isAuthorized(authorizationHeader, configuredToken, deps) {
  if (!isEnabled(configuredToken)) return false;
  const provided = bearerToken(authorizationHeader);
  if (!provided) return false;
  const d = deps || defaultDeps();
  return Boolean(d.equal(d.sha256(provided), d.sha256(configuredToken)));
}

module.exports = { MIN_TOKEN_LENGTH, bearerToken, isAuthorized, isEnabled };
