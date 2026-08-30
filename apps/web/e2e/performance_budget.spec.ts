import { expect, test } from "@playwright/test";

/**
 * NFR-003 — first meaningful paint under 2.5s on a cold 4G connection.
 *
 * The traceability matrix originally named "Lighthouse budget assertion in CI"
 * as the test for this. Lighthouse was tried and rejected on a concrete
 * ground rather than a preference: `@lhci/cli` pulls seven HIGH-severity
 * advisories (lighthouse → puppeteer-core → @puppeteer/browsers → extract-zip,
 * plus tmp and the lhci packages themselves), and this repository's CI runs
 * `npm audit --audit-level=high` as a gate. Adding it would have meant either
 * a red pipeline or weakening a security gate to accommodate a performance
 * tool. Neither is a trade worth making for a number Playwright can measure
 * directly.
 *
 * So the budget is asserted from the browser's own paint timings, with the
 * network throttled through CDP to the profile Lighthouse itself uses for
 * "Slow 4G". What is lost is Lighthouse's score and its opinions; what is kept
 * is the only part the requirement actually states — a real paint time, on a
 * real throttled load, failing the build when it regresses.
 *
 * "Cold" is enforced rather than assumed: the cache is disabled and a fresh
 * context is used per measurement, because a warm load measures the second
 * visit and every real first impression is a first visit.
 */

/** Lighthouse's "Slow 4G" preset, which is also what its mobile audits use.
 *  1.6 Mbps down, 750 Kbps up, 150ms RTT. */
const SLOW_4G = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};

/** The budget NFR-003 states. Applied to First Contentful Paint: "first
 *  meaningful paint" as a named Lighthouse metric was deprecated years ago
 *  for being unstable, and FCP is the closest defensible successor for
 *  "something the reader can see". */
const BUDGET_MS = 2500;

/** Surfaces a reviewer lands on first. The console is excluded deliberately —
 *  it is behind a click, and holding an interactive tool to a landing page's
 *  budget would measure the wrong thing. */
const SURFACES = ["/", "/story", "/architecture", "/delivery", "/reliability"];

for (const path of SURFACES) {
  test(`${path} paints within ${BUDGET_MS}ms on slow 4G`, async ({ browser }, testInfo) => {
    // One project's worth of measurement. Running this three times over would
    // triple the slowest job in CI to re-measure the same server response.
    test.skip(testInfo.project.name !== "desktop", "measured once, in the desktop project");

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const client = await context.newCDPSession(page);
      await client.send("Network.enable");
      await client.send("Network.emulateNetworkConditions", SLOW_4G);
      // Cold, explicitly. A warm load measures the second visit.
      await client.send("Network.setCacheDisabled", { cacheDisabled: true });

      await page.goto(path, { waitUntil: "load" });

      const fcp = await page.evaluate(() => {
        const entry = performance
          .getEntriesByType("paint")
          .find((e) => e.name === "first-contentful-paint");
        return entry ? entry.startTime : null;
      });

      expect(fcp, `${path} reported no paint timing at all`).not.toBeNull();
      expect(
        fcp!,
        `${path} first contentful paint was ${Math.round(fcp!)}ms against a ${BUDGET_MS}ms budget`,
      ).toBeLessThan(BUDGET_MS);
    } finally {
      await context.close();
    }
  });
}

test("the landing page ships no render-blocking third-party request", async ({
  browser,
}, testInfo) => {
  /** The usual way a budget like this is blown is not the app's own code but a
   *  font, a tag manager or an analytics script on the critical path. The
   *  self-hosted-font decision is what keeps this true, and nothing currently
   *  asserts it — so a single added `<script src="https://...">` would regress
   *  the number with no test naming the cause. */
  test.skip(testInfo.project.name !== "desktop", "measured once, in the desktop project");

  const context = await browser.newContext();
  const page = await context.newPage();
  const external: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    const sameOrigin = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (!sameOrigin) external.push(`${r.resourceType()} ${url.origin}`);
  });

  try {
    await page.goto("/", { waitUntil: "load" });
    expect(
      [...new Set(external)],
      "the landing page reached a third-party origin during load",
    ).toEqual([]);
  } finally {
    await context.close();
  }
});
