import { expect, test, type Page } from "@playwright/test";

/**
 * Following a reference (FR-034).
 *
 * The site cited D-016, ADR-0013, FR-020 and T-15 across every surface and not
 * one of them was followable. A citation a reader cannot check is a claim they
 * have to take on trust, which is the opposite of the argument this project
 * spends nine sprints making.
 *
 * What is asserted here is the property that matters and is easy to lose: the
 * sentence shown for an identifier is LIFTED from the record that defines it,
 * never authored a second time. The site has had three separate defects
 * (D-017, D-019, D-027) that were all one thing said twice and then edited
 * once.
 */

async function openRef(page: Page, id: string) {
  await page.locator(`.lex-ref[data-ref="${id}"]`).first().click();
  await expect(page.locator(".lookup-sentence")).toBeVisible();
}

test.describe("looking a reference up", () => {
  test("identifiers in ordinary prose become clickable", async ({ page }) => {
    await page.goto("/delivery");
    // The DOM pass runs after hydration; nothing is clickable before it.
    await expect(page.locator(".lex-ref").first()).toBeVisible();
    expect(await page.locator(".lex-ref").count()).toBeGreaterThan(20);
  });

  test("a defect resolves to its own record, not a paraphrase", async ({ page }) => {
    await page.goto("/find");
    await openRef(page, "D-016");
    const sentence = (await page.locator(".lookup-sentence").textContent()) ?? "";
    expect(sentence).toContain("D-016");
    // The exact wording of the defect log's description column. If the panel
    // ever starts writing its own summary this breaks, which is the point.
    expect(sentence).toContain("no planning ceremony");
    expect(await page.locator(".lookup-hit").count()).toBeGreaterThan(1);
  });

  test("every occurrence is dated and ordered, newest first by default", async ({ page }) => {
    await page.goto("/find");
    await openRef(page, "D-016");
    const dates = (await page.locator(".lookup-hit-date").allTextContents()).filter(
      (d) => d !== "undated",
    );
    expect(dates.length).toBeGreaterThan(1);
    const descending = [...dates].sort().reverse();
    expect(dates, "the bank must run newest to oldest").toEqual(descending);

    await page.locator(".lookup-order").click();
    const flipped = (await page.locator(".lookup-hit-date").allTextContents()).filter(
      (d) => d !== "undated",
    );
    expect(flipped, "and reverse on demand").toEqual([...dates].reverse());
  });

  test("free text searches the documents, not just the identifiers", async ({ page }) => {
    await page.goto("/find");
    await openRef(page, "ADR-0013");
    await page.locator(".lookup-input").fill("evidence gate");
    await page.locator(".lookup-input").press("Enter");
    // The corpus is fetched on first use, so this waits on a network round trip.
    await expect(page.locator(".lookup-hit").first()).toBeVisible({ timeout: 15_000 });
    const sentence = (await page.locator(".lookup-sentence").textContent()) ?? "";
    expect(sentence).toContain("evidence gate");
    expect(sentence).toMatch(/appears \d+ times? across \d+ documents?/);
  });

  test("selecting any text offers the same lookup", async ({ page }) => {
    await page.goto("/reliability");
    await page.locator(".lex-ref").first().waitFor();
    const selected = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.querySelector("main")!, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const i = (node.nodeValue ?? "").indexOf("refusal");
        if (i >= 0) {
          const range = document.createRange();
          range.setStart(node, i);
          range.setEnd(node, i + "refusal".length);
          const selection = window.getSelection()!;
          selection.removeAllRanges();
          selection.addRange(range);
          document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          return selection.toString();
        }
      }
      return null;
    });
    expect(selected).toBe("refusal");
    await expect(page.locator(".lookup-chip")).toBeVisible();
    await page.locator(".lookup-chip").click();
    await expect(page.locator(".lookup-sentence")).toContainText("refusal");
  });

  test("an identifier nothing defines says so rather than inventing one", async ({ page }) => {
    await page.goto("/find");
    // S2-RAG is cited by the traceability matrix; no sprint plan ever defined
    // it. Surfacing that is the honest answer, and it is how the gap was found.
    const orphan = page.locator(".find-nodef").first();
    await expect(orphan).toBeVisible();
    await expect(orphan).toContainText("no record");
  });

  test("the index page lists every identifier and filters", async ({ page }) => {
    await page.goto("/find");
    const all = await page.locator(".find-row").count();
    expect(all).toBeGreaterThan(150);
    await page.locator(".find-input").fill("ADR-");
    expect(await page.locator(".find-row").count()).toBeLessThan(all);
    await expect(page.locator(".find-row").first()).toContainText("ADR-");
  });

  test("escape closes it", async ({ page }) => {
    await page.goto("/find");
    await openRef(page, "D-016");
    await page.keyboard.press("Escape");
    await expect(page.locator(".lookup-sentence")).toHaveCount(0);
  });
});
