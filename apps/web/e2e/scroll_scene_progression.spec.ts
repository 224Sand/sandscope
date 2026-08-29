import { expect, test } from "@playwright/test";

/**
 * FR-017 — the scroll-driven product narrative.
 *
 * What makes this "cinematic" is testable, and it is not the footage. It is
 * three structural properties the design system commits to in writing:
 *
 *   1. the reader sets the pace — motion is driven by scroll position, so
 *      nothing happens on a timer and nothing is missed by looking away
 *   2. one idea occupies one viewport — scenes do not stack two claims on
 *      screen at once
 *   3. the sequence is an argument in order, not a gallery
 *
 * Each is asserted below. The subjective half — whether it *feels* cinematic —
 * is left to a human, and saying so is more useful than an assertion that
 * cannot fail.
 */

test.describe("the scroll-driven narrative", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("the hero is pinned and taller than the viewport, so scroll drives it", async ({ page }) => {
    /** A hero exactly one viewport tall has no scroll range to scrub across.
     *  ScrollScrubbed gives itself 240vh of travel and pins the content
     *  inside it; without that the technique degrades to a static image with
     *  extra machinery. */
    const geometry = await page.evaluate(() => {
      const section = document.querySelector("main > section");
      const pinned = section?.firstElementChild as HTMLElement | null;
      if (!section || !pinned) return null;
      return {
        sectionHeight: section.getBoundingClientRect().height,
        viewport: window.innerHeight,
        pinnedPosition: window.getComputedStyle(pinned).position,
      };
    });

    expect(geometry, "the landing page has no hero section").not.toBeNull();
    expect(
      geometry!.sectionHeight,
      "the hero has no scroll travel, so nothing can be scrubbed across it",
    ).toBeGreaterThan(geometry!.viewport * 1.5);
    expect(geometry!.pinnedPosition).toBe("sticky");
  });

  test("scenes are sequenced in reading order and none is empty", async ({ page }) => {
    const scenes = page.locator("main .scene");
    const count = await scenes.count();
    expect(count, "a narrative needs more than a couple of beats").toBeGreaterThan(3);

    const kickers: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const heading = (await scenes.nth(i).locator("h2").first().innerText()).trim();
      const body = (await scenes.nth(i).locator("p").last().innerText()).trim();
      expect(heading.length, `scene ${i} has no heading`).toBeGreaterThan(0);
      expect(body.length, `scene ${i} has no body copy`).toBeGreaterThan(40);
      kickers.push((await scenes.nth(i).locator("p.mono").first().innerText()).trim());
    }

    // Each scene announces a distinct beat. A repeated kicker means two scenes
    // are making the same point, which is the gallery failure mode.
    expect(new Set(kickers).size, `duplicate scene kickers: ${kickers.join(", ")}`).toBe(
      kickers.length,
    );
  });

  test("each scene owns its own vertical band rather than sharing one", async ({ page }) => {
    /** "One idea per viewport" is a geometry claim: consecutive scenes must
     *  not overlap vertically. Two scenes occupying the same band is exactly
     *  the two-claims-on-screen state the design system refuses. */
    const bands = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main .scene")).map((el) => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY };
      }),
    );

    for (let i = 1; i < bands.length; i += 1) {
      const previous = bands[i - 1]!;
      const current = bands[i]!;
      expect(
        current.top,
        `scene ${i} starts before scene ${i - 1} ends — they share a viewport band`,
      ).toBeGreaterThanOrEqual(previous.bottom - 1);
    }
  });

  test("scrolling advances the narrative rather than leaving the reader in place", async ({
    page,
  }) => {
    const firstSceneHeading = page.locator("main .scene h2").first();
    const lastSceneHeading = page.locator("main .scene h2").last();

    await expect(firstSceneHeading).not.toBeInViewport();
    await lastSceneHeading.scrollIntoViewIfNeeded();
    await expect(lastSceneHeading).toBeInViewport();

    const scrolled = await page.evaluate(() => window.scrollY);
    expect(scrolled, "the page did not actually scroll").toBeGreaterThan(0);
  });

  test("the narrative ends somewhere the reader can act", async ({ page }) => {
    /** A story with no exit is a brochure. The landing page must offer a path
     *  into the product itself. */
    await expect(page.locator('main a[href="/console"]').first()).toBeVisible();
  });
});
