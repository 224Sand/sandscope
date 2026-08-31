#!/usr/bin/env node
/**
 * Fill PROJECT_RECORD.html's figures from the derived record.
 *
 * Every other surface -- /delivery and README.md -- derives its numbers and is
 * guarded. This document typed them by hand, and has gone stale twice: once
 * claiming the web app was undeployed a week after it went live (D-019), once
 * carrying 13 done / 45 Planned after an audit had moved the real numbers
 * (D-020). Two recurrences in one file is a pattern, not bad luck.
 *
 * Each figure is a `<span data-figure="path.to.field">` whose text is replaced
 * from delivery.json. The written number stays in the span so the document is
 * still readable if this never runs -- an empty span would be worse than a
 * stale one.
 *
 *   node scripts/fill-project-record.mjs           # rewrite in place
 *   node scripts/fill-project-record.mjs --check   # fail if any figure is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RECORD = resolve(root, "docs/00-governance/PROJECT_RECORD.html");
const checkOnly = process.argv.includes("--check");

const delivery = JSON.parse(
  readFileSync(resolve(root, "apps/web/src/generated/delivery.json"), "utf8"),
);

/** `requirements.done` -> the value, or undefined if the path is wrong. */
function lookup(path) {
  return path.split(".").reduce((node, key) => (node == null ? node : node[key]), delivery);
}

const html = readFileSync(RECORD, "utf8");
const stale = [];
let unknown = null;

const filled = html.replace(
  /<span data-figure="([a-zA-Z.]+)">([^<]*)<\/span>/g,
  (whole, path, current) => {
    const value = lookup(path);
    if (value === undefined) {
      unknown = path;
      return whole;
    }
    if (String(value) !== current) stale.push(`${path}: says ${current}, derived ${value}`);
    return `<span data-figure="${path}">${value}</span>`;
  },
);

if (unknown) {
  console.error(`fill-project-record: no field "${unknown}" in delivery.json`);
  process.exit(1);
}

const count = [...html.matchAll(/data-figure=/g)].length;
if (count === 0) {
  // A filler that silently fills nothing is the D-015 failure: a check that
  // reports success without having checked anything.
  console.error("fill-project-record: no data-figure spans found; the document has moved");
  process.exit(1);
}

if (checkOnly) {
  if (stale.length) {
    console.error(`PROJECT_RECORD figures are stale (${stale.length})\n`);
    for (const s of stale) console.error("  " + s);
    console.error("\n  Run: node scripts/fill-project-record.mjs");
    process.exit(1);
  }
  console.log(`project record check passed: ${count} figures match the derived record`);
} else {
  writeFileSync(RECORD, filled);
  console.log(`filled ${count} figures in PROJECT_RECORD.html`);
}
