import { expect, test, type Page } from "@playwright/test";

/**
 * FR-013 — the execution trace viewer.
 *
 * The requirement is about the VIEWER, not about the agent, so the SSE stream
 * is intercepted and replayed from a fixture rather than driven against a live
 * runtime. That is a deliberate scope decision and worth defending: an e2e
 * test that needed the agent up would fail for reasons that have nothing to do
 * with the code it claims to cover — a sleeping container, an exhausted free
 * tier, a rate limit — and a test that is red for unrelated reasons gets
 * ignored, which is worse than not having it.
 *
 * The fixture is written against `src/lib/events.ts`, the shared contract both
 * sides compile against, so it cannot drift from the real event shape without
 * the typecheck failing. What it deliberately does NOT do is assert the agent
 * produces these events — `tests/test_api.py` does that against the real graph.
 */

/** Mirrors a real low-risk incident_triage run: deterministic nodes take no
 *  model call, the two reasoning nodes do, one of them served from cache. */
const SPANS = [
  { name: "classify", start_ms: 0, duration_ms: 1.2, calls: 0, cache_hits: 0 },
  { name: "retrieve", start_ms: 1.2, duration_ms: 48.4, calls: 0, cache_hits: 0 },
  { name: "assess_evidence", start_ms: 49.6, duration_ms: 3.1, calls: 0, cache_hits: 0 },
  { name: "hypothesise", start_ms: 52.7, duration_ms: 812.5, calls: 1, cache_hits: 0 },
  { name: "verify", start_ms: 865.2, duration_ms: 2.4, calls: 0, cache_hits: 0 },
  { name: "propose_action", start_ms: 867.6, duration_ms: 405.9, calls: 1, cache_hits: 1 },
  { name: "risk_gate", start_ms: 1273.5, duration_ms: 0.8, calls: 0, cache_hits: 0 },
  { name: "emit", start_ms: 1274.3, duration_ms: 0.4, calls: 0, cache_hits: 0 },
];

const LEDGER = [
  {
    provider: "groq",
    model: "llama-3.3-70b",
    tokens_in: 2140,
    tokens_out: 190,
    estimated_usd: 0.00082,
    actual_usd: 0.00061,
    cache_hit: false,
  },
  {
    provider: "groq",
    model: "llama-3.3-70b",
    tokens_in: 0,
    tokens_out: 0,
    estimated_usd: 0.0004,
    actual_usd: 0,
    cache_hit: true,
  },
];

function sse(kind: string, data: unknown): string {
  return `event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function stubTheStream(page: Page): Promise<void> {
  await page.route("**/api/runs/stream", async (route) => {
    const body =
      sse("run_started", { run_id: "run-e2e", workload: "incident_triage" }) +
      sse("node_completed", { node: "classify", duration_ms: 1.2 }) +
      sse("node_completed", { node: "retrieve", duration_ms: 48.4, hits: 6 }) +
      sse("node_completed", {
        node: "assess_evidence",
        duration_ms: 3.1,
        verdict: "sufficient",
        rationale: "Both the runbook and the incident record cover this failure mode.",
      }) +
      sse("node_completed", {
        node: "hypothesise",
        duration_ms: 812.5,
        text: "[1] Pool wait time rose before query time, which points at the pool.",
      }) +
      // Citations ride on `verify`, not on `hypothesise` — that is where the
      // runtime resolves each marker against the evidence it actually
      // retrieved (`_summarise` in api/app.py), and the console reads them
      // from there. The first draft of this fixture put them on `hypothesise`
      // and the test below failed, which is the fixture being wrong about the
      // contract rather than the console being wrong about the fixture.
      sse("node_completed", {
        node: "verify",
        duration_ms: 2.4,
        uncited: [],
        citations: [
          {
            claim: "Pool wait time rose before query time, which points at the pool.",
            chunk_id: "rb-database-connection-pool#00",
            resolved: true,
          },
        ],
      }) +
      sse("node_completed", {
        node: "propose_action",
        duration_ms: 405.9,
        proposal: "Compare db.pool.wait_ms against db.query.p99_ms to confirm the ordering.",
      }) +
      sse("node_completed", { node: "risk_gate", duration_ms: 0.8, risk: "low" }) +
      sse("run_completed", {
        run_id: "run-e2e",
        status: "completed",
        risk: "low",
        citations: 1,
        uncited: 0,
        cost_usd: 0.00061,
        tokens_avoided: 2140,
        providers: [{ provider: "groq", event: "served" }],
        total_ms: 1274.7,
        spans: SPANS,
        ledger: LEDGER,
      });

    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body,
    });
  });
}

test.describe("the execution trace viewer", () => {
  test.beforeEach(async ({ page }) => {
    await stubTheStream(page);
    await page.goto("/console");
  });

  test("no trace is shown before a run has produced one", async ({ page }) => {
    /** An empty waterfall implying a run happened would be worse than no
     *  waterfall — D-009 was precisely the console showing something the
     *  run had not produced. */
    await expect(page.getByRole("heading", { name: /^Trace$/ })).toHaveCount(0);
  });

  test("every node the run passed through appears as a row", async ({ page }) => {
    await page.getByRole("button", { name: /run triage/i }).click();
    await expect(page.getByRole("heading", { name: /^Trace$/ })).toBeVisible();

    // The human-readable labels Trace.tsx maps the node names onto.
    for (const label of [
      "Classify",
      "Retrieve evidence",
      "Assess evidence",
      "Reason",
      "Verify citations",
      "Propose action",
      "Risk gate",
      "Emit",
    ]) {
      await expect(
        page.getByText(label, { exact: true }).first(),
        `the trace is missing a row for ${label}`,
      ).toBeVisible();
    }
  });

  test("the trace reports how many nodes cost nothing", async ({ page }) => {
    /** The cost story is the reason this viewer exists rather than a list of
     *  timings: 5 of the 8 nodes in this run decided without a model call. */
    await page.getByRole("button", { name: /run triage/i }).click();
    await expect(page.getByText(/8 spans/)).toBeVisible();
    await expect(page.getByText(/5 nodes decided without a model call/)).toBeVisible();
  });

  test("row width encodes duration, so the slow node is visibly the widest", async ({ page }) => {
    /** The whole argument of a waterfall is that "why did that take so long"
     *  is answered by looking. If every row were the same width the view
     *  would be a list wearing a chart's clothes. */
    await page.getByRole("button", { name: /run triage/i }).click();
    await expect(page.getByRole("heading", { name: /^Trace$/ })).toBeVisible();

    const widths = await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll("h3")).find(
        (h) => h.textContent?.trim() === "Trace",
      );
      const panel = heading?.closest("section");
      if (!panel) return [];
      // The bars are the absolutely-positioned children carrying a % width.
      return Array.from(panel.querySelectorAll<HTMLElement>("[style*='width']"))
        .map((el) => Number.parseFloat(el.style.width))
        .filter((w) => Number.isFinite(w) && w > 0);
    });

    expect(widths.length, "no duration bars were rendered").toBeGreaterThan(1);
    const widest = Math.max(...widths);
    const narrowest = Math.min(...widths);
    expect(
      widest / narrowest,
      "every trace row is the same width, so duration is not encoded at all",
    ).toBeGreaterThan(2);
  });

  test("the cited claim reaches the evidence panel with its passage", async ({ page }) => {
    await page.getByRole("button", { name: /run triage/i }).click();
    await expect(page.getByText(/rb-database-connection-pool/).first()).toBeVisible();
  });

  test("a run that streams an error surfaces it rather than failing silently", async ({ page }) => {
    await page.route("**/api/runs/stream", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: sse("error", { error: "ProviderExhausted", detail: "every provider refused" }),
      });
    });
    await page.getByRole("button", { name: /run triage/i }).click();
    await expect(page.getByText(/every provider refused/)).toBeVisible();
  });
});
