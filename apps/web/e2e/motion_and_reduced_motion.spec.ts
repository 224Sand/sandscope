import { expect, test } from "@playwright/test";

/**
 * DR-001 and FR-018 — motion, and the paths that must work without it.
 *
 * The rule this suite enforces is the one written into the design system and
 * repeated in `Scene.tsx`: **motion changes emphasis, never availability.**
 * A scene that is invisible until an IntersectionObserver fires is a scene
 * that does not exist for a reader with reduced motion, a failed observer, or
 * a screen reader walking the DOM — and it would still look perfect in a
 * screenshot taken after scrolling.
 *
 * Runs under all three projects in playwright.config.ts. The reduced-motion
 * and mobile runs are not redundant copies: both take genuinely different
 * branches in `ScrollScrubbed` and `Scene`, so a single desktop assertion
 * would leave those branches unexecuted.
 */

test.describe("content survives without motion", () => {
  test("every landing scene's heading and body are in the DOM and legible", async ({ page }) => {
    await page.goto("/");
    // Every scene heading, without scrolling to any of them. Under reduced
    // motion Scene sets itself visible immediately; under normal motion the
    // observer has not fired for off-screen scenes, but the CONTENT must be
    // present either way — that is the availability half of the rule.
    const headings = page.locator("main h2");
    const count = await headings.count();
    expect(count, "the landing page rendered no scene headings at all").toBeGreaterThan(3);

    for (let i = 0; i < count; i += 1) {
      const text = (await headings.nth(i).innerText()).trim();
      expect(text.length, `scene ${i} rendered an empty heading`).toBeGreaterThan(0);
    }
  });

  test("scene content is never hidden from the accessibility tree", async ({ page }) => {
    await page.goto("/");
    /** `opacity: 0` is a visual state; `display:none`/`visibility:hidden`/
     *  `aria-hidden` remove content from assistive technology entirely. The
     *  first is the intended pre-reveal state, the last three would be the
     *  bug — and they are indistinguishable in a screenshot. */
    const hiddenHeadings = await page.evaluate(() => {
      const bad: string[] = [];
      for (const h of Array.from(document.querySelectorAll("main h2"))) {
        const style = window.getComputedStyle(h);
        const inAriaHidden = h.closest("[aria-hidden='true']") !== null;
        if (style.display === "none" || style.visibility === "hidden" || inAriaHidden) {
          bad.push(h.textContent?.slice(0, 60) ?? "(empty)");
        }
      }
      return bad;
    });
    expect(hiddenHeadings, "scene headings removed from the a11y tree").toEqual([]);
  });

  test("decorative media never carries meaning a reader would miss", async ({ page }) => {
    await page.goto("/");
    /** Background footage is atmosphere. If it were ever the only carrier of
     *  an idea, a reader with reduced motion — where it is removed outright —
     *  would lose that idea silently. Every video must therefore be marked
     *  decorative. */
    const undecorated = await page.evaluate(() =>
      Array.from(document.querySelectorAll("video"))
        .filter((v) => v.getAttribute("aria-hidden") !== "true" && !v.closest("[aria-hidden='true']"))
        .map((v) => v.getAttribute("src") ?? "(no src)"),
    );
    expect(undecorated, "video not marked decorative").toEqual([]);
  });

  test("no video autoplays with sound", async ({ page }) => {
    await page.goto("/");
    const unmuted = await page.evaluate(() =>
      Array.from(document.querySelectorAll("video"))
        .filter((v) => !v.muted)
        .map((v) => v.getAttribute("src") ?? "(no src)"),
    );
    expect(unmuted, "a video would play audio unprompted").toEqual([]);
  });
});

test.describe("the reduced-motion path specifically", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "chromium-only projects");

  test("the poster frame replaces the scrubbed video under reduced motion", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "reduced-motion",
      "asserted in the reduced-motion project",
    );
    await page.goto("/");
    // ScrollScrubbed swaps the <video> for an <img> poster entirely rather
    // than merely pausing it: scrubbing is the motion, so stopping it means
    // not shipping the decoder work at all.
    await expect(page.locator('img[src="/media/hero.jpg"]')).toHaveCount(1);
    await expect(page.locator('video[src="/media/hero.mp4"]')).toHaveCount(0);
  });

  test("scene content is immediately visible rather than waiting on an observer", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "reduced-motion",
      "asserted in the reduced-motion project",
    );
    await page.goto("/");
    const opacities = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main .scene .wrap")).map(
        (el) => window.getComputedStyle(el).opacity,
      ),
    );
    expect(opacities.length).toBeGreaterThan(0);
    for (const opacity of opacities) {
      expect(Number(opacity), "a scene stayed transparent under reduced motion").toBeGreaterThan(
        0.99,
      );
    }
  });
});

test.describe("the no-JavaScript floor (D-021)", () => {
  /**
   * The regression guard for D-021.
   *
   * `Scene` used to reveal itself with an IntersectionObserver and a `visible`
   * state starting at `false`, which put an inline `opacity: 0` on every scene
   * in the server-rendered markup. Run with JavaScript disabled, all seven
   * scenes on the landing page measured `opacity: 0` — a blank page whose
   * content was, technically, all present in the DOM.
   *
   * This runs in its own context because `javaScriptEnabled` is fixed when the
   * context is created and cannot be toggled per-page.
   */
  test("the landing page is legible with JavaScript disabled", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto("/", { waitUntil: "load" });

      const opacities = await page.evaluate(() =>
        Array.from(document.querySelectorAll("main .scene .wrap")).map(
          (el) => window.getComputedStyle(el).opacity,
        ),
      );
      expect(opacities.length, "no scenes rendered at all without JavaScript").toBeGreaterThan(3);
      for (const opacity of opacities) {
        expect(
          Number(opacity),
          "a scene is invisible without JavaScript — this is D-021, and it means the " +
            "reveal has been moved back into JS from the CSS `.reveal` class",
        ).toBeGreaterThan(0.99);
      }

      // Belt and braces: the headings must also be genuinely visible to
      // Playwright's own visibility heuristic, not merely non-transparent.
      await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe("the mobile comprehension path", () => {
  test("the poster frame replaces the scrubbed video on a phone", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "asserted in the mobile project");
    await page.goto("/");
    await expect(page.locator('img[src="/media/hero.jpg"]')).toHaveCount(1);
    await expect(page.locator('video[src="/media/hero.mp4"]')).toHaveCount(0);
  });

  test("the page does not scroll horizontally on a phone", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "asserted in the mobile project");
    await page.goto("/");
    /** A horizontal scrollbar on a phone is the single most common symptom of
     *  a layout that was only ever looked at on a laptop. */
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "the page overflows horizontally on a phone").toBeLessThanOrEqual(1);
  });
});
