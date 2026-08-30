import { expect, test } from "@playwright/test";

import council from "../src/generated/council.json";
import dataset from "../src/generated/dataset.json";

/**
 * FR-031 and FR-032 — the synthetic dataset and the governance record, published.
 *
 * Both existed only as assertions before these pages. The site said the data was
 * synthetic in one sentence, and said twelve named roles built it with the
 * documents in the repo. An unverifiable claim about provenance is exactly the
 * kind this project spends its whole argument refusing to make.
 *
 * Every assertion below is written against the DERIVED files, so it cannot pass
 * by rendering a convenient subset, and cannot drift from the corpus and the
 * charter the pages claim to describe.
 */

test.describe("the data surface (FR-031)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/data");
  });

  test("every corpus document is listed, not a sample", async ({ page }) => {
    const rows = page.locator(".panel", { hasText: "The document library" }).locator("tbody tr");
    await expect(rows).toHaveCount(dataset.corpus.documents);
  });

  test("every service in the invented estate is listed", async ({ page }) => {
    const rows = page.locator(".panel", { hasText: "The invented company" }).locator("tbody tr");
    await expect(rows).toHaveCount(dataset.estate.services);
  });

  test("every fault pattern is shown with the runbook that covers it", async ({ page }) => {
    const body = await page.locator("body").innerText();
    for (const fault of dataset.faults) {
      expect(body, `${fault.name} is missing`).toContain(fault.name);
      expect(body, `${fault.id} has no runbook shown`).toContain(fault.runbook);
    }
  });

  test("every question-generation mechanism is explained AND shown", async ({ page }) => {
    /** A published inventory naming a mechanism without showing one is asking
     *  to be taken on trust, which is the opposite of what this page is for. */
    const body = await page.locator("body").innerText();
    for (const mechanism of dataset.questions.mechanisms) {
      expect(body, `${mechanism.id} has no example question on the page`).toContain(
        mechanism.example,
      );
    }
  });

  test("the page states what the corpus deliberately does not cover", async ({ page }) => {
    /** The gap list is the load-bearing half. Without verified gaps, "correct
     *  refusal" cannot be measured at all — every refusal would count as a
     *  mistake and the threshold could be zero without a test noticing. */
    const gaps = page.locator(".panel", { hasText: "deliberately does NOT cover" });
    await expect(gaps).toHaveCount(1);
    await expect(gaps).toContainText(/disk exhaustion|DNS|retention/i);
    await expect(gaps).toContainText(/correction/i);
  });

  test("it says plainly that none of it is real", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /everything here is invented/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(/no real company/i);
  });

  test("the headline counts match the derived record", async ({ page }) => {
    const body = await page.locator("body").innerText();
    expect(body).toContain(String(dataset.questions.total));
    expect(body).toContain(String(dataset.corpus.chunks));
  });
});

test.describe("the council surface (FR-032)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/council");
  });

  test("every role in the charter is listed with what it owns", async ({ page }) => {
    const rows = page.locator(".panel", { hasText: "The delivery roster" }).locator("tbody tr");
    await expect(rows).toHaveCount(council.roles.length);
    for (const role of council.roles) {
      expect(role.owns.length, `${role.role} owns nothing`).toBeGreaterThan(0);
    }
  });

  test("the stakeholder roles and their authority are published", async ({ page }) => {
    const rows = page.locator(".panel", { hasText: "Where the human sits" }).locator("tbody tr");
    await expect(rows).toHaveCount(council.stakeholders.length);
  });

  test("every reviewed artefact carries its citation", async ({ page }) => {
    /** A role reaction with no artefact behind it is an invented opinion, which
     *  is the one thing the review process forbids. */
    const body = await page.locator("body").innerText();
    for (const artifact of council.artifacts) {
      expect(body, `artefact ${artifact.number} is missing`).toContain(artifact.title);
      for (const citation of artifact.citations) {
        expect(body, `${artifact.title} lost its citation`).toContain(citation.label);
      }
    }
  });

  test("every role reaction is rendered, from more than one role per artefact", async ({ page }) => {
    // Lower-cased before comparing: the role label carries `text-transform:
    // uppercase`, and innerText returns the RENDERED text. Asserting the
    // visual casing would couple this test to a styling choice it has no
    // opinion about — the same trap the ADR-heading test fell into.
    const body = (await page.locator("body").innerText()).toLowerCase();
    for (const artifact of council.artifacts) {
      expect(
        artifact.reactions.length,
        `${artifact.title} has only one voice, which is not a review`,
      ).toBeGreaterThan(1);
      for (const reaction of artifact.reactions) {
        expect(body, `${artifact.title}: ${reaction.role} is missing`).toContain(
          reaction.role.toLowerCase(),
        );
      }
    }
  });

  test("the disagreements are printed rather than smoothed over", async ({ page }) => {
    /** Where roles diverged is the reason to run a multi-role review at all. A
     *  page showing only agreement would be a rubber stamp with labels on. */
    const diverged = council.artifacts.filter((a) => a.diverged);
    expect(diverged.length, "no divergence was recorded at all").toBeGreaterThan(3);
    await expect(page.getByText(/where they diverged/i).first()).toBeVisible();
  });

  test("the rule that makes it work is stated", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/may not sign off its own work/i);
  });
});

test("both surfaces are reachable from the masthead", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('nav a[href="/data"]')).toHaveCount(1);
  await expect(page.locator('nav a[href="/council"]')).toHaveCount(1);
});
