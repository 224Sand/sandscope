import { expect, test } from "@playwright/test";

/**
 * VIS-001 — "reads as production-grade engineering to a senior reviewer."
 *
 * A requirement phrased as a subjective impression cannot be asserted
 * directly, and pretending otherwise would produce a test that passes on
 * anything. What CAN be asserted is the substrate that impression rests on:
 * a reviewer who lands on the site can reach every proof surface, each one
 * renders real derived content rather than an empty shell, and nothing on the
 * path 404s or throws. If any of that is false the impression is definitely
 * not achieved; if all of it holds, the judgement is a human's to make.
 *
 * That distinction is stated rather than papered over, because the alternative
 * — an `expect(true).toBe(true)` wearing a requirement ID — is exactly the
 * defect class logged as D-013 and D-015 in this project's own defect log.
 */

const SURFACES = [
  { path: "/", heading: /accountable as the people/i },
  { path: "/story", heading: /accountable as the people/i },
  { path: "/console", heading: /watch it reason/i },
  { path: "/architecture", heading: /decisions, and what they cost/i },
  { path: "/reliability", heading: /measured, including where it fails/i },
  { path: "/delivery", heading: /the record, not the claim/i },
];

test.describe("the reviewer journey", () => {
  for (const surface of SURFACES) {
    test(`${surface.path} renders its own content, not an error shell`, async ({ page }) => {
      const response = await page.goto(surface.path);
      expect(response?.status(), `${surface.path} did not return 200`).toBe(200);
      await expect(page.getByRole("heading", { name: surface.heading }).first()).toBeVisible();
    });
  }

  test("every surface is reachable from the masthead without typing a URL", async ({ page }) => {
    await page.goto("/");
    for (const path of ["/story", "/console", "/architecture", "/reliability", "/delivery"]) {
      const link = page.locator(`nav a[href="${path}"]`);
      await expect(link, `no masthead link to ${path}`).toHaveCount(1);
    }
  });

  test("no surface logs a console error or throws during render", async ({ page }) => {
    /** D-008 was a CSP that blocked React hydration and left every button
     *  inert HTML — the page LOOKED correct and did nothing. A screenshot
     *  test would have passed. Listening for page errors is what catches
     *  that class. */
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    for (const surface of SURFACES) {
      await page.goto(surface.path);
      await page.waitForLoadState("networkidle");
    }

    // Failed media/API requests are a separate concern (the runtime may be
    // asleep); genuine script errors are not.
    const scriptErrors = errors.filter((e) => !/Failed to load resource|net::ERR/i.test(e));
    expect(scriptErrors, `script errors during render:\n${scriptErrors.join("\n")}`).toEqual([]);
  });

  test("the delivery surface shows derived numbers, not placeholders", async ({ page }) => {
    /** The whole argument of /delivery is that its figures come from the
     *  repository. A zero, a dash or an obvious placeholder there is the one
     *  failure that discredits the page it appears on. */
    await page.goto("/delivery");
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/\d+\s*requirements/i);
    expect(body).not.toMatch(/\bTODO\b|\bTBD\b|lorem ipsum|\bplaceholder\b/i);
  });
});
