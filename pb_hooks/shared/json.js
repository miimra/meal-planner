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
  const raw = valueField(record, name);
  return Array.isArray(raw) ? raw : [];
}

function valueField(record, name) {
  const raw = record.get(name);
  if (!Array.isArray(raw) || !raw.length || typeof raw[0] !== "number") return raw;
  try {
    return JSON.parse(decodeBytes(raw));
  } catch (_) {
    return null;
  }
}

module.exports = { arrayField, decodeBytes, valueField };
