"use strict";

const MAX_URL_LENGTH = 2048;
const TRACKING_KEYS = ["fbclid", "gclid", "igshid", "si"];

function trimUrl(value) {
  return String(value || "").trim().replace(/^[<(\[]+/, "").replace(/[>),.;!\]]+$/, "");
}

function parse(raw) {
  const value = trimUrl(raw);
  if (!value || value.length > MAX_URL_LENGTH || /[\u0000-\u0020\u007f]/.test(value)) throw new Error("invalid_source_url");
  const match = /^(https?):\/\/([^\/?#]+)([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i.exec(value);
  if (!match) throw new Error("invalid_source_url");
  const scheme = match[1].toLowerCase();
  const authority = match[2];
  if (authority.indexOf("@") !== -1) throw new Error("unsafe_source_url");

  let hostname = "";
  let port = "";
  if (authority.charAt(0) === "[") {
    const close = authority.indexOf("]");
    if (close < 0) throw new Error("invalid_source_url");
    hostname = authority.slice(1, close).toLowerCase();
    if (authority.slice(close + 1)) {
      if (authority.charAt(close + 1) !== ":") throw new Error("invalid_source_url");
      port = authority.slice(close + 2);
    }
  } else {
    const colon = authority.lastIndexOf(":");
    if (colon !== -1) {
      if (authority.indexOf(":") !== colon) throw new Error("invalid_source_url");
      hostname = authority.slice(0, colon).toLowerCase();
      port = authority.slice(colon + 1);
    } else {
      hostname = authority.toLowerCase();
    }
  }
  hostname = hostname.replace(/\.$/, "");
  if (!hostname || hostname.indexOf("%") !== -1 || /[^a-z0-9.:-]/.test(hostname)) throw new Error("invalid_source_url");
  if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) throw new Error("invalid_source_url");
  if (port && port !== "80" && port !== "443") throw new Error("unsafe_source_url");
  const path = match[3] || "/";
  return { scheme, hostname, port, path: path.charAt(0) === "/" ? path : "/" + path, query: match[4] || "" };
}

function parseIpv4(hostname) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;
  if (hostname.split(".").some((part) => part.length > 1 && part.charAt(0) === "0")) return null;
  const parts = hostname.split(".").map(Number);
  if (parts.some((part) => part < 0 || part > 255)) return null;
  return parts;
}

function isForbiddenIpv4(parts) {
  const a = parts[0];
  const b = parts[1];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 0 || b === 168)) return true;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && parts[2] === 100))) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  return a === 192 && b === 0 && parts[2] === 2;
}

function isForbiddenIp(value) {
  let host = String(value || "").toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = parseIpv4(host);
  if (v4) return isForbiddenIpv4(v4);
  if (host.indexOf(":") === -1) return false;
  if (!/^[0-9a-f:]+$/.test(host)) return true;
  if (host === "::" || host === "::1") return true;
  const mapped = /(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  if (mapped) {
    const mappedV4 = parseIpv4(mapped[1]);
    return !mappedV4 || isForbiddenIpv4(mappedV4);
  }
  // Accept only global unicast IPv6 and exclude the documentation range.
  if (!/^[23][0-9a-f]{0,3}:/.test(host)) return true;
  return /^2001:0?db8:/i.test(host);
}

function assertSafe(raw, resolvedAddresses) {
  const value = parse(raw);
  const host = value.hostname;
  if (host === "localhost" || /\.(?:localhost|local|internal|home|lan|onion|invalid|test|example)$/.test(host)) {
    throw new Error("unsafe_source_url");
  }
  if (/^[\d.]+$/.test(host) && !parseIpv4(host)) throw new Error("unsafe_source_url");
  if (/(?:^|\.)0x[0-9a-f]+(?:\.|$)/i.test(host)) throw new Error("unsafe_source_url");
  if (isForbiddenIp(host)) throw new Error("unsafe_source_url");
  if (resolvedAddresses !== undefined) {
    if (!Array.isArray(resolvedAddresses) || !resolvedAddresses.length) throw new Error("source_dns_failed");
    for (const address of resolvedAddresses) {
      if (isForbiddenIp(address)) throw new Error("unsafe_source_url");
    }
  }
  return value;
}

function decodeQuery(value) {
  try { return decodeURIComponent(String(value || "").replace(/\+/g, "%20")); } catch (_) { return String(value || ""); }
}

function queryPairs(query) {
  if (!query) return [];
  return query.split("&").filter(Boolean).map((part) => {
    const eq = part.indexOf("=");
    return [decodeQuery(eq < 0 ? part : part.slice(0, eq)), decodeQuery(eq < 0 ? "" : part.slice(eq + 1))];
  });
}

function queryValue(parsed, key) {
  for (const pair of queryPairs(parsed.query)) if (pair[0] === key) return pair[1];
  return "";
}

function youtubeId(raw) {
  const value = parse(raw);
  if (value.hostname === "youtu.be") return value.path.split("/")[1] || null;
  if (value.hostname === "youtube.com" || value.hostname === "www.youtube.com" || value.hostname === "m.youtube.com") {
    if (value.path === "/watch") return queryValue(value, "v") || null;
    const match = /^\/(?:shorts|embed|live)\/([^/]+)/.exec(value.path);
    return match ? match[1] : null;
  }
  return null;
}

function platform(raw) {
  const host = parse(raw).hostname;
  if (host === "youtu.be" || host === "youtube.com" || /\.youtube\.com$/.test(host)) return "youtube";
  if (host === "instagram.com" || /\.instagram\.com$/.test(host)) return "instagram";
  return "web";
}

function encodeQuery(value) {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

function canonicalize(raw) {
  const value = assertSafe(raw);
  const id = youtubeId(raw);
  if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) return "https://www.youtube.com/watch?v=" + encodeURIComponent(id);
  let path = value.path.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  let pairs = queryPairs(value.query).filter((pair) => {
    const key = pair[0].toLowerCase();
    return key.slice(0, 4) !== "utm_" && TRACKING_KEYS.indexOf(key) === -1;
  });
  pairs.sort((a, b) => (a[0] + "=" + a[1]).localeCompare(b[0] + "=" + b[1]));
  const query = pairs.map((pair) => encodeQuery(pair[0]) + (pair[1] ? "=" + encodeQuery(pair[1]) : "")).join("&");
  const port = value.port && !((value.scheme === "https" && value.port === "443") || (value.scheme === "http" && value.port === "80")) ? ":" + value.port : "";
  return value.scheme + "://" + (value.hostname.indexOf(":") >= 0 ? "[" + value.hostname + "]" : value.hostname) + port + path + (query ? "?" + query : "");
}

function extractFirstUrl(text) {
  const match = /https?:\/\/[^\s<>]+/i.exec(String(text || ""));
  if (!match) return null;
  const value = trimUrl(match[0]);
  assertSafe(value);
  return value;
}

function resolve(base, location) {
  if (/^https?:\/\//i.test(location)) return canonicalize(location);
  const parsed = parse(base);
  if (!location || /^\/\//.test(location) || /^(?:data|file|javascript):/i.test(location)) throw new Error("invalid_redirect_url");
  let path = location;
  if (location.charAt(0) !== "/") {
    const folder = parsed.path.slice(0, parsed.path.lastIndexOf("/") + 1);
    path = folder + location;
  }
  const segments = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") segments.pop(); else segments.push(part);
  }
  const port = parsed.port ? ":" + parsed.port : "";
  return canonicalize(parsed.scheme + "://" + parsed.hostname + port + "/" + segments.join("/"));
}

module.exports = { assertSafe, canonicalize, extractFirstUrl, isForbiddenIp, parse, platform, resolve, youtubeId };
