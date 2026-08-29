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

  test("the map is interactive, not a drawing labelled interactive", async ({ page }) => {
    /** FR-019. The page shipped a static inline SVG under the heading
     *  "interactive architecture view" for three sprints: no state, no
     *  handlers, nothing selectable. A diagram a reader cannot interrogate
     *  tells them the shape of the system and nothing about whether any of it
     *  is real. */
    const nodes = page.locator(".map-node");
    expect(await nodes.count(), "the map has no selectable components").toBeGreaterThan(5);

    const detail = page.getByTestId("system-map-detail");
    await expect(detail).toContainText(/select any component/i);

    await nodes.first().click();
    await expect(detail).not.toContainText(/select any component/i);
    // The claim that makes it worth clicking: a real file, not a description.
    await expect(detail.locator("a")).toHaveAttribute("href", /\/blob\/main\/apps\/.+\.\w+$/);
  });

  test("selecting a component names the file that implements it", async ({ page }) => {
    const evidence = page.locator(".map-node", { hasText: "Evidence gate" });
    await evidence.click();
    const detail = page.getByTestId("system-map-detail");
    await expect(detail).toContainText("Evidence gate");
    await expect(detail.locator("a")).toContainText("retrieval/evidence.py");
  });

  test("the map is operable from the keyboard", async ({ page }) => {
    /** An SVG full of click handlers is a mouse-only surface, and a reader on
     *  a keyboard would get exactly the static drawing this replaced. */
    const first = page.locator(".map-node").first();
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("system-map-detail")).not.toContainText(/select any component/i);

    // Selecting the same node again clears it, so the panel cannot get stuck.
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("system-map-detail")).toContainText(/select any component/i);
  });

  test("every file the map points at is inside the repository", async ({ page }) => {
    /** D-023 was twelve decision links that pointed at a DIRECTORY because a
     *  filename was never emitted, and they rendered as ordinary links. This
     *  asserts each destination is a file path rather than trusting the
     *  template that builds it. */
    const nodes = page.locator(".map-node");
    const count = await nodes.count();
    for (let i = 0; i < count; i += 1) {
      await nodes.nth(i).click();
      const href = await page.getByTestId("system-map-detail").locator("a").getAttribute("href");
      expect(href, `component ${i} links nowhere`).toMatch(/\/blob\/main\/[\w./-]+\.\w+$/);
    }
  });

  test("the dashed-path labels are not struck through by their own lines", async ({ page }) => {
    /** Each of the two return paths has a masking plate behind its label so
     *  the dashes do not run through the words. Both plates were 4px narrower
     *  than the text they covered, which struck out the last two characters
     *  of each. Measured rather than eyeballed — at this size it looks fine
     *  right up until someone tries to read it. */
    const overruns = await page.getByTestId("system-map").evaluate((svg) => {
      const bad: string[] = [];
      for (const text of Array.from(svg.querySelectorAll("text"))) {
        const content = text.textContent ?? "";
        if (!content.includes("cache hit") && !content.includes("INSUFFICIENT")) continue;
        const plate = text.previousElementSibling as SVGRectElement | null;
        if (!plate) {
          bad.push(`${content}: no masking plate`);
          continue;
        }
        const box = (text as SVGTextElement).getBBox();
        const plateEnd = Number(plate.getAttribute("x")) + Number(plate.getAttribute("width"));
        if (box.x + box.width > plateEnd) {
          bad.push(`${content}: text ends at ${box.x + box.width}, plate at ${plateEnd}`);
        }
      }
      return bad;
    });
    expect(overruns, "a dashed line runs through its own label").toEqual([]);
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
