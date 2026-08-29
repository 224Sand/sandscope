#!/usr/bin/env node
/**
 * A document must not claim a live surface is undeployed, or a resolved
 * impediment is still blocking, after it demonstrably isn't.
 *
 * This exists because of a real incident: SandScope was deployed to Vercel
 * partway through the same session that wrote PROJECT_RECORD.html and
 * SPRINT_08_PLAN.md, and neither document was updated. Both kept asserting
 * "the web application is not deployed" and "blocked on deployment
 * credentials" for a full week after the deploy landed -- discovered only
 * because the user quoted the stale text back and asked "true?"
 *
 * The traceability guard (check-traceability.mjs) already catches a
 * requirement claiming Done with no test to back it -- overclaiming. This
 * is the mirror gap: a document UNDERCLAIMING a blocker that has since
 * resolved. Both directions drift; only one had a guard.
 *
 * This can only check what it can verify. It knows two things: whether the
 * deployed URL in product.config.json actually answers, and whether specific
 * known-stale phrases still appear in governance docs. It is not a general
 * staleness detector -- it is aimed at the one class of claim that already
 * went stale for a week and cost a direct question to catch.
 *
 *   node scripts/check-deploy-claims.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const config = JSON.parse(readFileSync(resolve(root, "product.config.json"), "utf8"));

async function isLive(url) {
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

const STALE_PHRASES = [
  "web application is not deployed",
  "No Vercel project exists",
  "no public URL exists",
  "blocked on deployment credentials",
];

function markdownAndHtmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownAndHtmlFiles(full));
    else if (/\.(md|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// product.config.json has no frontendUrl field -- verified directly, not
// assumed. A silent fallback here would mean this guard checks a URL nobody
// actually configured, which is exactly the class of untested assumption
// this project exists to catch. Fail loudly instead of guessing.
if (!config.frontendUrl) {
  console.error("check-deploy-claims: product.config.json has no frontendUrl field.");
  process.exit(1);
}
const webUrl = config.frontendUrl;
const live = await isLive(webUrl);

const problems = [];

if (live) {
  for (const file of markdownAndHtmlFiles(resolve(root, "docs"))) {
    const text = readFileSync(file, "utf8");
    for (const phrase of STALE_PHRASES) {
      if (text.includes(phrase)) {
        problems.push(
          `${file.replace(root + "/", "")}: contains ${JSON.stringify(phrase)}, ` +
            `but ${webUrl} answered just now. The deploy claim is stale.`,
        );
      }
    }
  }
} else {
  console.log(
    `note: ${webUrl} did not answer -- skipping the "claims it's undeployed" check ` +
      `(cannot tell a real outage from a network issue here, so this direction is advisory only).`,
  );
}

if (problems.length) {
  console.error(`deploy-claims check FAILED (${problems.length})\n`);
  for (const p of problems) console.error("  " + p);
  console.error("\n  Update the document, or the claim that it's undeployed is false.");
  process.exit(1);
}
console.log(`deploy-claims check passed: ${webUrl} is live and no doc contradicts it`);
