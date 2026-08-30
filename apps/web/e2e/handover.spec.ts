import { expect, test } from "@playwright/test";

import delivery from "../src/generated/delivery.json";

/**
 * FR-033 — one handover document serving a non-technical reader and a CTO.
 *
 * The design claim is layered depth: plain prose end to end, with the
 * parameters and failure modes underneath in native disclosure. Two properties
 * make that claim true rather than decorative, and both are asserted here —
 * the deep content must be in the DOM whether or not it is open (otherwise it
 * is invisible to search and to a screen reader), and the page must work with
 * JavaScript off (otherwise the "native, not a toggle" reasoning is fiction).
 */

test.describe("the handover surface", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/handover");
  });

  test("both audiences are served: plain prose and deep detail", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /at whatever depth you need/i })).toBeVisible();
    const deep = page.locator("details.deep");
    expect(await deep.count(), "no deeper layers at all").toBeGreaterThan(8);
  });

  test("deep content is in the DOM even while collapsed", async ({ page }) => {
    /** The whole reason for native <details> over a JS toggle. Content behind
     *  a collapsed disclosure is still found by ctrl-F, still read by a screen
     *  reader walking the document, and still indexed. */
    const collapsed = await page.locator("details.deep:not([open])").count();
    expect(collapsed, "every block was already open, so this proves nothing").toBeGreaterThan(5);

    const text = await page.locator("body").textContent();
    // A specific constant that only appears inside a collapsed block.
    expect(text, "deep content is absent from the DOM until opened").toContain("INSUFFICIENT_BELOW");
    expect(text).toContain("10.38");
  });

  test("the architect-level constants are actually stated", async ({ page }) => {
    /** "Technical detail" is easy to claim and easy to fake with adjectives.
     *  These are the specific numbers a CTO would ask for. */
    const text = (await page.locator("body").textContent()) ?? "";
    for (const constant of [
      "1.5", // BM25 k1
      "0.75", // BM25 b
      "768", // embedding dimensions
      "0.6", // lexical weight
      "0.4", // dense weight
      "0.74", // INSUFFICIENT_BELOW
      "10.38", // SUFFICIENT_ABOVE
      "56.8%", // classifier refusal rate as a gate
      "6.1%", // held-out false-answer rate
    ]) {
      expect(text, `the constant ${constant} is missing`).toContain(constant);
    }
  });

  test("it names the files a reader can go and check", async ({ page }) => {
    const text = (await page.locator("body").textContent()) ?? "";
    expect(text).toContain("retrieval/evidence.py");
    expect(text).toContain("orchestrator/graph.py");
    expect(text).toContain("THREAT_MODEL.md");
  });

  test("headline figures come from the derived record", async ({ page }) => {
    const text = (await page.locator("body").textContent()) ?? "";
    expect(text).toContain(`${delivery.requirements.done}/${delivery.requirements.total}`);
    expect(text).toContain(String(delivery.defects.total));
  });

  test("a glossary defines the jargon rather than assuming it", async ({ page }) => {
    const terms = page.locator(".kt-term");
    expect(await terms.count()).toBeGreaterThan(10);
    await expect(page.locator("body")).toContainText(/Backend For Frontend/i);
  });

  test("it carries the handover agenda, not just the material", async ({ page }) => {
    /** The request was for a KT SESSION, not only a reference. Someone has to
     *  be able to run it. */
    await expect(page.locator(".kt-agenda li")).toHaveCount(7);
    await expect(page.locator("body")).toContainText(/questions you will be asked/i);
  });

  test("it is reachable from the masthead", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('nav a[href="/handover"]')).toHaveCount(1);
  });
});

test("the handover reads without JavaScript", async ({ browser }) => {
  /** Native disclosure is the reason this page does not need a depth toggle.
   *  If it needed JS, a reader with it off would get headings and nothing
   *  underneath — which is D-021 repeated on the one page that exists to
   *  explain the project. */
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("/handover", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: /at whatever depth you need/i })).toBeVisible();

    const text = (await page.locator("body").textContent()) ?? "";
    expect(text, "deep detail is unreachable without JavaScript").toContain("INSUFFICIENT_BELOW");

    // And the disclosure still opens — <details> is a browser primitive.
    const first = page.locator("details.deep").first();
    await first.locator("summary").click();
    await expect(first).toHaveAttribute("open", "");
  } finally {
    await context.close();
  }
});

test.describe("the interactive explainer (FR-033)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/handover");
  });

  test("the evidence gate responds to the reader", async ({ page }) => {
    const gate = page.locator(".gate");
    await expect(gate).toBeVisible();

    const before = await page.locator(".gate-score").innerText();
    await page.locator(".gate-question", { hasText: "DNS resolution failure" }).click();
    await expect(page.locator(".gate-score")).not.toHaveText(before);

    // Defer, NOT refuse — and that is the honest result. The first draft of
    // this test asserted a refusal, because "the corpus contains no mention of
    // DNS anywhere" sounds like the clearest possible refusal case. It scores
    // 1.57 and INSUFFICIENT_BELOW is 0.74, so it defers.
    //
    // Not one of the six real probes scores low enough to be refused outright.
    // That is the 87% deferral rate as a concrete fact rather than a
    // percentage, and the component would be lying if it showed otherwise.
    await expect(page.locator(".gate-verdict")).toContainText(/defer/i);
  });

  test("it crosses a real threshold rather than being decorative", async ({ page }) => {
    /** A slider that never changes the verdict is a picture of a slider. */
    const slider = page.locator(".gate-slider");
    await slider.fill("0.2");
    await expect(page.locator(".gate-verdict")).toContainText(/refuse/i);
    await slider.fill("12");
    await expect(page.locator(".gate-verdict")).toContainText(/answer/i);
    await slider.fill("5");
    await expect(page.locator(".gate-verdict")).toContainText(/defer/i);
  });

  test("it shows the overlap honestly, not a tidy separation", async ({ page }) => {
    /** The claim the component exists to make: an UNANSWERABLE question
     *  outscores answerable ones. If the pins were arranged to look neat, the
     *  page would be teaching a lie about the hardest part of the problem. */
    const pins = page.locator(".gate-pin");
    const rows = await pins.evaluateAll((nodes) =>
      nodes.map((n) => ({
        truth: (n as HTMLElement).dataset.truth,
        left: Number.parseFloat((n as HTMLElement).style.left),
      })),
    );
    const answerable = rows.filter((r) => r.truth === "answerable").map((r) => r.left);
    const unanswerable = rows.filter((r) => r.truth === "unanswerable").map((r) => r.left);
    expect(answerable.length).toBeGreaterThan(1);
    expect(
      Math.max(...unanswerable),
      "no unanswerable pin sits above an answerable one — the overlap is being hidden",
    ).toBeGreaterThan(Math.min(...answerable));
    // `.first()`: there are two findings printed beside the chart now — the
    // overlap, and the fact that nothing real is refused outright.
    await expect(page.locator(".gate-overlap").first()).toContainText(/cannot answer/i);
    await expect(page.locator(".gate-overlap").last()).toContainText(/refused outright/i);
  });

  test("the gate is operable from the keyboard", async ({ page }) => {
    const slider = page.locator(".gate-slider");
    await slider.focus();
    const start = await page.locator(".gate-score").innerText();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".gate-score")).not.toHaveText(start);
  });

  test("the depth control opens and closes every deep block", async ({ page }) => {
    const control = page.locator(".depth-option");
    await expect(control).toHaveCount(2);

    await page.getByRole("button", { name: /full technical/i }).click();
    const total = await page.locator("details.deep").count();
    await expect(page.locator("details.deep[open]")).toHaveCount(total);

    await page.getByRole("button", { name: /plain english/i }).click();
    await expect(page.locator("details.deep[open]")).toHaveCount(0);
  });

  test("plain mode collapses content but never removes it", async ({ page }) => {
    /** The whole feature rests on this. Hiding the deep half would make the
     *  page's own claim about layered depth false, on the page that exists to
     *  explain the project — and would take it out of ctrl-F and the
     *  accessibility tree (AC-C10). */
    await page.getByRole("button", { name: /plain english/i }).click();
    await expect(page.locator("details.deep[open]")).toHaveCount(0);

    const text = await page.locator("body").textContent();
    expect(text, "collapsing removed the deep content from the DOM").toContain(
      "INSUFFICIENT_BELOW",
    );

    const hidden = await page.locator("details.deep").evaluateAll((nodes) =>
      nodes.filter((n) => window.getComputedStyle(n).display === "none").length,
    );
    expect(hidden, "a deep block was display:none, which removes it from search").toBe(0);
  });

  test("the ambient video is decorative and silent", async ({ page }) => {
    const media = page.locator(".kt-ground-video");
    if ((await media.count()) === 0) return; // replaced by its poster, which is correct
    await expect(page.locator(".kt-ground")).toHaveAttribute("aria-hidden", "true");
    expect(await media.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
  });
});
