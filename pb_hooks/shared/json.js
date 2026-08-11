"use strict";

function decodeBytes(bytes) {
  let encoded = "";
  for (const byte of bytes) {
    let hex = Number(byte).toString(16);
    if (hex.length < 2) hex = "0" + hex;
    encoded += "%" + hex;
  }
  return decodeURIComponent(encoded);
}

function arrayField(record, name) {
  const raw = record.get(name);
  if (!Array.isArray(raw)) return [];
  if (!raw.length || typeof raw[0] !== "number") return raw;
  try {
    const parsed = JSON.parse(decodeBytes(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

module.exports = { arrayField, decodeBytes };
