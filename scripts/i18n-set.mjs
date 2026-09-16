#!/usr/bin/env node
// Atomic helper for adding / changing guest-site strings in BOTH locales.
//
//   node scripts/i18n-set.mjs '{"home.heroTitle":{"en":"…","ar":"…"}}'
//   node scripts/i18n-set.mjs path/to/patch.json
//   node scripts/i18n-set.mjs --delete home.oldKey home.otherKey
//
// Dotted keys create nested objects. A lock file serialises concurrent
// writers, so several people (or agents) can call this at the same time
// without losing each other's changes. Never hand-edit messages/*.json while
// others are working on it — use this script.

import { readFileSync, writeFileSync, openSync, closeSync, unlinkSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const LOCK = path.join(ROOT, "messages", ".lock");
const FILES = { en: path.join(ROOT, "messages", "en.json"), ar: path.join(ROOT, "messages", "ar.json") };

async function lock() {
  for (let i = 0; i < 400; i++) {
    try {
      const fd = openSync(LOCK, "wx");
      closeSync(fd);
      return;
    } catch {
      await sleep(25);
    }
  }
  throw new Error("i18n-set: could not acquire messages/.lock");
}
function unlock() {
  if (existsSync(LOCK)) unlinkSync(LOCK);
}

function setDeep(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}
function deleteDeep(obj, dotted) {
  const parts = dotted.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof cur?.[p] !== "object") return false;
    cur = cur[p];
  }
  return delete cur[parts[parts.length - 1]];
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: i18n-set.mjs '<json>' | <patch.json> | --delete key…");
  process.exit(2);
}

await lock();
try {
  const docs = { en: JSON.parse(readFileSync(FILES.en, "utf8")), ar: JSON.parse(readFileSync(FILES.ar, "utf8")) };
  if (args[0] === "--delete") {
    for (const key of args.slice(1)) for (const l of ["en", "ar"]) deleteDeep(docs[l], key);
  } else {
    const raw = args[0].trim().startsWith("{") ? args[0] : readFileSync(path.resolve(args[0]), "utf8");
    const patch = JSON.parse(raw);
    for (const [key, val] of Object.entries(patch)) {
      if (!val || typeof val !== "object" || typeof val.en !== "string" || typeof val.ar !== "string") {
        throw new Error(`i18n-set: "${key}" must be {"en": string, "ar": string}`);
      }
      setDeep(docs.en, key, val.en);
      setDeep(docs.ar, key, val.ar);
    }
  }
  for (const l of ["en", "ar"]) writeFileSync(FILES[l], JSON.stringify(docs[l], null, 2) + "\n");
  console.log("i18n-set: ok");
} finally {
  unlock();
}
