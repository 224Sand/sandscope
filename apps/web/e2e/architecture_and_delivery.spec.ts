import { expect, test } from "@playwright/test";

import record from "../src/generated/delivery.json";

/**
 * BR-011, FR-019, FR-021, FR-023, FR-024 — the proof surfaces.
 *
 * These are the pages whose entire claim is that they can be checked, which
 * makes them the ones where an unverified assertion is most expensive. Three
 * of these requirements were only ever PARTIALLY built and this suite is what
 * made that visible rather than arguable:
 *
 *   FR-021 rendered three aggregate numbers — total, done, planned — and
 *          called it "traceability rendered publicly". A reader could see
 *          that 46 of 58 were done and had no way to ask which.
 *   FR-023 rendered a title, a status and a link to GitHub. That is a
 *          bibliography; the requirement asks for context and consequences.
 *   FR-019 called a static inline SVG an "interactive architecture view".
 *
 * The assertions below are written against the DERIVED record rather than
 * against numbers typed here, so they cannot drift from the repository the
 * page claims to be reporting on.
 */

test.describe("the delivery record", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/delivery");
  });

  test("every requirement in the matrix is rendered, not just a count", async ({ page }) => {
    /** FR-021. The count is derived from TRACEABILITY.md at build time, so
     *  this asserts the page shows as many rows as the matrix actually has —
     *  it cannot pass by rendering a convenient subset. */
    await page.locator(".matrix-details").evaluate((el: HTMLDetailsElement) => {
      el.open = true;
    });
    await expect(page.locator(".matrix-table tbody tr")).toHaveCount(record.requirements.total);
  });

  test("each requirement row names the test it rests on", async ({ page }) => {
    /** A traceability matrix without the test column is a status board. The
     *  test name is the part that makes a `Done` checkable. */
    await page.locator(".matrix-details").evaluate((el: HTMLDetailsElement) => {
      el.open = true;
    });
    const firstRow = page.locator(".matrix-table tbody tr").first();
    const cells = await firstRow.locator("td").allInnerTexts();
    expect(cells.length, "the matrix row is missing columns").toBeGreaterThanOrEqual(5);
    expect(cells[2]?.trim().length, "the Test column is empty").toBeGreaterThan(0);
  });

  test("a specific known requirement can be found with its real status", async ({ page }) => {
    await page.locator(".matrix-details").evaluate((el: HTMLDetailsElement) => {
      el.open = true;
    });
    const row = page.locator(".matrix-table tbody tr", { hasText: "NFR-002" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(/zero infrastructure cost/i);
    await expect(row).toContainText(/done/i);
  });

  test("every decision record renders its context and its consequences", async ({ page }) => {
    /** FR-023. The consequences half is the one that matters: a decision log
     *  recording only upside is a marketing document. Asserted for ALL
     *  records rather than a sample, because the one with no consequences
     *  written down is exactly the one that would be skipped. */
    const records = page.locator("details.adr");
    await expect(records).toHaveCount(record.adrs.length);

    for (let i = 0; i < record.adrs.length; i += 1) {
      const adr = records.nth(i);
      await adr.evaluate((el: HTMLDetailsElement) => {
        el.open = true;
      });
      // Lower-cased before comparing: `.adr-h` carries `text-transform:
      // uppercase`, and innerText returns the RENDERED text, so these arrive
      // as "CONTEXT"/"DECISION"/"CONSEQUENCES". Asserting the visual casing
      // would couple this test to a styling choice it has no opinion about.
      const headings = (await adr.locator(".adr-h").allInnerTexts()).map((h) =>
        h.trim().toLowerCase(),
      );
      expect(headings, `ADR ${i} is missing a section`).toEqual([
        "context",
        "decision",
        "consequences",
      ]);

      const paragraphs = await adr.locator(".adr-p").allInnerTexts();
      for (const [index, text] of paragraphs.entries()) {
        const body = text.trim();
        expect(body.length, `ADR ${i} section ${index} is empty`).toBeGreaterThan(40);

        // The truncation this guards against is the one the first version of
        // the derive script shipped: `$` under the `m` flag ended every
        // section at its first NEWLINE, so all three rendered as ~75
        // plausible-looking characters cut mid-clause ("...unavailability,
        // not").
        //
        // A length floor is the wrong discriminator — ADR-0003's decision is
        // a genuine 109 characters and ADR-0012's is 87 ("Run the agent
        // runtime on Northflank, Developer Sandbox plan, in europe-west") —
        // and setting the floor above those would fail on correct records
        // while still passing on a truncation that happened to be long. What
        // actually separates the two is whether the text ENDS like a
        // sentence, which a mid-clause cut never does.
        expect(
          body,
          `ADR ${i} section ${index} ends mid-clause, which is what the truncation ` +
            `bug looked like: ${JSON.stringify(body.slice(-60))}`,
        ).toMatch(/[.!?)\]"']$/);
      }
    }
  });

  test("the sprint record shows velocity as real commit counts", async ({ page }) => {
    /** FR-022 rendered here rather than only in the Python contract test:
     *  this is the surface a reader actually sees the number on.
     *
     *  Scoped to the innermost matching section — `section:has-text()` matches
     *  ancestors too, so the loose version resolved to two nodes and failed
     *  Playwright's strict-mode check rather than asserting anything. */
    const sprints = page.locator("section", { has: page.getByRole("heading", { name: "Sprints" }) });
    const text = await sprints.last().innerText();
    expect(text).toMatch(/\d+ commits?/);
    // The hand-typed form this replaced (D-020 / FR-022).
    expect(text).not.toMatch(/\d+\s*\/\s*\d+\s*points/i);
  });

  test("live CI status is fetched rather than baked into the page", async ({ page }) => {
    /** FR-020. A committed pass/fail would be the one number on this page
     *  that could quietly become a lie.
     *
     *  Waits for the request itself rather than for `networkidle`: the CI
     *  component refreshes on a timer, so the network never goes idle and
     *  that wait could only ever time out. */
    const ciRequest = page.waitForRequest((r) => r.url().includes("/api/ci"), { timeout: 15_000 });
    await page.reload();
    await expect(
      ciRequest,
      "the page never asked for CI status, so it is showing a stored value",
    ).resolves.toBeTruthy();
  });
});

test.describe("the architecture surface", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/architecture");
  });

  test("the system map is present and described for a screen reader", async ({ page }) => {
    /** BR-011. A diagram carrying the request path with no accessible name is
     *  a decorative image to anyone not looking at it.
     *
     *  Addressed by test id, not by position: the masthead mark is also an
     *  `svg[role="img"]`, so `.first()` asserted against the LOGO — whose
     *  9-character label duly failed, for entirely the wrong reason. */
    const map = page.getByTestId("system-map");
    await expect(map).toBeVisible();
    const label = await map.getAttribute("aria-label");
    expect(label?.length ?? 0, "the system map has no accessible description").toBeGreaterThan(40);
  });

  test("the system map names the platform the runtime actually runs on", async ({ page }) => {
    /** D-022: this diagram said "hugging face space" for a week after
     *  ADR-0012 moved the runtime to Northflank. The stale-claim guard greps
     *  documents under docs/, not components, so this is where that class of
     *  drift gets caught on this surface.
     *
     *  `textContent`, not `innerText` — an <svg> is an SVGElement rather than
     *  an HTMLElement and has no innerText to read. */
    const map = (await page.getByTestId("system-map").textContent()) ?? "";
    expect(map.toLowerCase()).not.toContain("hugging face");
    expect(map.toLowerCase()).toContain("northflank");
  });

  test("every decision listed here resolves to a real record", async ({ page }) => {
    const links = page.locator('a[href*="/adr/"]');
    const count = await links.count();
    expect(count, "the architecture page lists no decision records").toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const href = await links.nth(i).getAttribute("href");
      expect(href, `decision link ${i} has no destination`).toBeTruthy();
      expect(href).toMatch(/\.md$/);
    }
  });
});

test.describe("the reliability surface", () => {
  test("postmortems for real defects are listed", async ({ page }) => {
    /** FR-024. Publishing only successes would make the whole delivery
     *  record worthless, so the postmortems are load-bearing rather than
     *  decorative. */
    await page.goto("/reliability");
    const links = page.locator('a[href*="postmortem"]');
    await expect(
      links.first(),
      "no postmortem is linked from the reliability surface",
    ).toBeVisible();
    expect(await links.count()).toBeGreaterThanOrEqual(3);
  });

  test("known weaknesses are published rather than only strengths", async ({ page }) => {
    await page.goto("/reliability");
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/weak|limitation|fail/i);
  });
});
