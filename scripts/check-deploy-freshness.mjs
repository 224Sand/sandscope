/**
 * Fail when the deployed site is serving figures the repository has moved past.
 *
 * The public site went eight days stale carrying a completed sprint, and
 * nothing noticed — because the OTHER Vercel project was going green on every
 * push (ADR-0014). Connecting the repository makes that unlikely rather than
 * impossible: a failed build, a removed hook or a paused project all reproduce
 * it in silence.
 *
 * Same class as D-019, and it gets the same treatment: a check that fails.
 *
 * Compares one derived figure -- the requirement count rendered on /delivery --
 * against the local record. Skips cleanly when the site is unreachable, because
 * a network blip must not fail an unrelated build: unreachable and stale are
 * different states and only one of them is this guard's business.
 *
 *   node scripts/check-deploy-freshness.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

const config = read("product.config.json");
const delivery = read("apps/web/src/generated/delivery.json");
const site = config.frontendUrl;

if (!site) {
  console.error("check-deploy-freshness: product.config.json has no frontendUrl");
  process.exit(1);
}

const expected = String(delivery.requirements.total);

let html;
try {
  const response = await fetch(`${site}/delivery`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    console.log(`deploy freshness: ${site} returned ${response.status} — skipping`);
    process.exit(0);
  }
  html = await response.text();
} catch (error) {
  console.log(`deploy freshness: ${site} unreachable (${error.name}) — skipping`);
  process.exit(0);
}

if (html.includes(expected)) {
  console.log(`deploy freshness: live site shows ${expected} requirements, matching the record`);
  process.exit(0);
}

console.error(
  `deploy freshness FAILED\n\n` +
    `  The repository has ${expected} requirements; ${site}/delivery does not show\n` +
    `  that number anywhere, so it is serving an older build.\n\n` +
    `  Check the project is still connected to the repository (ADR-0014), then:\n` +
    `    cd apps/web && npx vercel --prod\n`,
);
process.exit(1);
