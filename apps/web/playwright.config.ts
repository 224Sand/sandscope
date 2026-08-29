import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration for the experience layer.
 *
 * This file exists because `apps/web` had NO test runner of any kind until
 * Sprint 9 — no jest, no vitest, no Playwright. Ten requirements in the
 * traceability matrix (VIS-001, DR-001, BR-011, FR-013/017/018/019/021/023/024)
 * named an `e2e/*.spec.ts` file as their evidence, and not one of those files
 * existed. The matrix was honest about it — every one of those rows read
 * `Planned` — but the effect was that the entire experience layer, which is
 * the half a reviewer actually looks at, was verified only by `next build`
 * succeeding. D-018 is the precedent for why that is not enough: a green
 * pipeline that never exercises the code under change is read as evidence and
 * is not.
 *
 * Chromium only, deliberately. A cross-browser matrix here would triple CI
 * time to defend against a class of bug this project has never had, while the
 * defects it HAS had (D-008 CSP blocking hydration, D-009 rendering an
 * assessment the governance layer refused) reproduce identically in one engine.
 * Breadth of BROWSER is the wrong axis; breadth of BEHAVIOUR is the right one,
 * which is why the reduced-motion and mobile projects below exist instead.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // A committed `test.only` silently disables the rest of the file. Failing the
  // build on it in CI is the same posture as the traceability guard: a check
  // that can be quietly switched off is not a check.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // FR-018's first half. Reduced motion is not a cosmetic preference here:
      // ScrollScrubbed REPLACES the video with a poster frame under it, and
      // Scene sets its content visible immediately instead of waiting on an
      // IntersectionObserver. Those are different code paths, so they need
      // their own run rather than a single assertion inside the desktop one.
      name: "reduced-motion",
      // `reducedMotion` is a browser-context option, not a top-level `use`
      // key — it lives under `contextOptions` as of Playwright 1.62.
      use: { ...devices["Desktop Chrome"], contextOptions: { reducedMotion: "reduce" } },
    },
    {
      // FR-018's second half. Below 768px the same poster-frame substitution
      // happens for a different reason — spending a phone's data to scrub a
      // video produces a worse result than the still.
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],

  // Build and serve the real production output rather than `next dev`.
  // Development mode differs from production in ways this project has already
  // been bitten by: D-008 was a CSP that was correct in production and made
  // development impossible, which means the two are genuinely not the same
  // application and testing the wrong one proves the wrong thing.
  webServer: {
    command: "npm run build && npm run start -- --port 3000",
    url: "http://127.0.0.1:3000",
    // Never reuse a server that is already up, not even locally.
    //
    // `reuseExistingServer: !process.env.CI` is the documented default and it
    // is a trap for this workflow: a server left running from an earlier build
    // is silently reused, so the suite tests the PREVIOUS binary and reports
    // green. That happened twice here — once masking a fix that had not been
    // rebuilt, and once masking a hydration mismatch (#418) that CI then
    // caught on a build it had made itself. A local pass that does not
    // exercise the current code is worse than no local run, because it is
    // believed.
    //
    // The cost is a rebuild per invocation. Next's incremental build makes
    // that about a second, against the cost of trusting a false green.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
