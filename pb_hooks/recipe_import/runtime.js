"use strict";

const sourceUrl = require(`${typeof __hooks === "undefined" ? "." : __hooks + "/recipe_import"}/url.js`);

function commandOutput() {
  const args = Array.prototype.slice.call(arguments);
  const command = $os.cmd.apply($os, args);
  return String(toString(command.output()) || "");
}

function resolvePublic(hostname) {
  const output = commandOutput("nslookup", hostname);
  const addresses = [];
  const answer = /\bName:\s*[^\r\n]+([\s\S]*)$/i.exec(output);
  if (!answer) throw new Error("source_dns_failed");
  const matches = answer[1].match(/(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f]*:[0-9a-f:]+/gi) || [];
  for (const match of matches) {
    const value = String(match).toLowerCase();
    if (sourceUrl.isForbiddenIp(value)) throw new Error("unsafe_source_url");
    if (addresses.indexOf(value) === -1) addresses.push(value);
  }
  sourceUrl.assertSafe("https://" + hostname + "/", addresses);
  return addresses;
}

function tempDirectory() {
  const value = commandOutput("mktemp", "-d", $os.tempDir() + "/meal-recipe-fetch.XXXXXXXX").trim();
  if (!value) throw new Error("source_fetch_failed");
  return value;
}

function curlTransport(config) {
  const parsed = sourceUrl.parse(config.url);
  const addresses = config.resolvedAddresses || [];
  sourceUrl.assertSafe(config.url, addresses);
  const address = addresses[0];
  if (!address) throw new Error("source_dns_failed");
  const port = parsed.port || (parsed.scheme === "https" ? "443" : "80");
  const directory = tempDirectory();
  const headerPath = directory + "/headers";
  const bodyPath = directory + "/body";
  try {
    const resolve = parsed.hostname + ":" + port + ":" + (address.indexOf(":") === -1 ? address : "[" + address + "]");
    const args = [
      "curl", "--silent", "--show-error", "--request", "GET",
      "--noproxy", "*",
      "--max-time", String(Number(config.timeout || 15)),
      "--max-filesize", String(Number(config.maxBytes || 2 * 1024 * 1024)),
      "--proto", "=http,https", "--max-redirs", "0",
      "--resolve", resolve,
      "--header", "Accept: text/html,application/xhtml+xml,application/ld+json,text/plain;q=0.8",
      "--header", "User-Agent: HouseholdMealPlanner/1.0 (+https://meal.number34.nl)",
      "--dump-header", headerPath, "--output", bodyPath,
      "--write-out", "%{http_code}", config.url,
    ];
    const statusText = commandOutput.apply(null, args).trim();
    const statusCode = Number(statusText.slice(-3));
    if (!Number.isInteger(statusCode)) throw new Error("source_fetch_failed");
    const rawHeaders = String(toString($os.readFile(headerPath)) || "");
    const headers = {};
    for (const line of rawHeaders.split(/\r?\n/)) {
      const colon = line.indexOf(":");
      if (colon <= 0) continue;
      const key = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (!headers[key]) headers[key] = [];
      headers[key].push(value);
    }
    const body = $os.readFile(bodyPath);
    if (body.length > Number(config.maxBytes || 2 * 1024 * 1024)) throw new Error("source_too_large");
    return { statusCode, headers, body };
  } finally {
    try { commandOutput("rm", "-rf", directory); } catch (_) { /* best-effort cleanup */ }
  }
}

module.exports = { curlTransport, resolvePublic };
