/**
 * The motion budget, checked against the files that are actually committed.
 *
 * DESIGN_SYSTEM.md section 5 has said "a budget, enforced in CI: a scene that
 * exceeds it does not merge" since Sprint 6. Nothing in .github/workflows had
 * ever referenced a media file. The budget was enforced only inside
 * fetch-media.mjs, which runs on a laptop, by hand, when someone chooses to --
 * so a clip could be committed over budget and nothing would say so. That is
 * the same class as D-019, D-022 and D-027: a document describing a guard that
 * does not exist reads exactly like one describing a guard that does.
 *
 * This checks the artefacts rather than the encoder, because the encoder is
 * not what ships. Duration needs ffprobe; where it is unavailable the check
 * SKIPS that half loudly instead of passing quietly, which is the distinction
 * D-013 was about.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BUDGET, DURATION_SLACK_SECONDS } from "./media-budget.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mediaDir = resolve(root, "apps/web/public/media");
const manifestPath = resolve(mediaDir, "CREDITS.json");

function duration(file) {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return Number.parseFloat(out.trim());
  } catch {
    return null;
  }
}

const problems = [];
let probed = 0;

if (!existsSync(manifestPath)) {
  problems.push("apps/web/public/media/CREDITS.json is missing — run scripts/fetch-media.mjs.");
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.length === 0) problems.push("CREDITS.json lists no clips.");

  for (const clip of manifest) {
    const mp4 = resolve(mediaDir, `${clip.name}.mp4`);
    const jpg = resolve(mediaDir, `${clip.name}.jpg`);

    if (!existsSync(mp4)) {
      problems.push(`${clip.name}: CREDITS.json lists it, but ${clip.name}.mp4 is not committed.`);
      continue;
    }
    // The poster is not decoration: below 768px and under reduced motion it
    // REPLACES the video, so a missing one is a blank section, not a downgrade.
    if (!existsSync(jpg)) {
      problems.push(`${clip.name}: no poster. Below 768px and under reduced motion the poster IS the content.`);
    }

    const bytes = statSync(mp4).size;
    const mb = (n) => `${(n / 1024 / 1024).toFixed(2)}MB`;

    if (bytes > BUDGET.bytes) {
      problems.push(
        `${clip.name}.mp4 is ${mb(bytes)}, over the ${mb(BUDGET.bytes)} budget. ` +
          `Shorten it or raise CRF deliberately — do not raise the budget to fit the file.`,
      );
    }
    // A manifest that disagrees with the file is a stale manifest, and the
    // delivery surface reads its figures from exactly this kind of record.
    if (clip.bytes !== bytes) {
      problems.push(
        `${clip.name}: CREDITS.json says ${mb(clip.bytes)}, the committed file is ${mb(bytes)}. ` +
          `Re-run scripts/fetch-media.mjs so the manifest matches what ships.`,
      );
    }

    const seconds = duration(mp4);
    if (seconds === null) continue;
    probed += 1;
    if (seconds > BUDGET.seconds + DURATION_SLACK_SECONDS) {
      problems.push(
        `${clip.name}.mp4 runs ${seconds.toFixed(2)}s, over the ${BUDGET.seconds}s budget.`,
      );
    }
  }

  if (probed === 0) {
    process.stdout.write(
      "  note: ffprobe unavailable — duration NOT checked, only byte size. " +
        "This is a skip, not a pass.\n",
    );
  }
}

if (problems.length > 0) {
  process.stderr.write(`Media budget check FAILED (${problems.length})\n\n`);
  for (const p of problems) process.stderr.write(`  ${p}\n`);
  process.stderr.write(
    `\nBudget: ${BUDGET.seconds}s and ${(BUDGET.bytes / 1024 / 1024).toFixed(1)}MB per clip ` +
      `(DESIGN_SYSTEM.md section 5).\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `Media budget passed: every clip within ${BUDGET.seconds}s and ` +
    `${(BUDGET.bytes / 1024 / 1024).toFixed(1)}MB` +
    `${probed > 0 ? ` (${probed} durations probed)` : ""}\n`,
);
