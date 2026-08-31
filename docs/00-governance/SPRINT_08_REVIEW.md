# Sprint 8 — Review & Retrospective

**Sprint:** 8 — Hardening & Release · **Closed:** 2026-08-31 · **Release:** 0.8.0 ·
**Gate:** Release Approval

## 1. Sprint goal

**Met.** Both halves are deployed and verified connected, the pen tests run
against the live system, every check script can now be proven to fail, and the
threat model has been re-tested against a running deployment rather than a
design.

## 2. Delivered

All seven stories.

| | |
|---|---|
| Tests | 423 functions across 23 files · 507 pass, 30 skip |
| End-to-end | 247 across 3 browser projects |
| Unit (edge) | 11 |
| Pen tests | **4/4 passed, 2 skipped** against production — see §4 |
| Requirements | 61, all `Done`, each naming a test that exists |
| Defects | 26 logged, 7 severity 1 |
| CI guards | 9, every one with a test proving it fails on bad input |

## 3. What running it against production actually found

Sprint 7's finding was that three checks could not fail. Sprint 8's is
narrower and sharper: **a check can be unable to fail only against a
particular target**, and report a clean pass anyway.

The first remote pen-test run reported **6/6**. It was wrong twice over.

`P-3` exercises the per-IP rate limit, and gives each probe its own
`x-forwarded-for` so probes do not contaminate each other. Vercel overwrites
that header at the edge — which is exactly why the application is allowed to
trust it — so remotely all six probes arrive from one address. P-3 was testing
the harness's own machine against a shared limit.

Worse, it **poisoned the rest of the suite**. That clean 6/6 left the address
rate-limited for an hour. The next run showed
`P-7 FAIL: expected 4xx, got 429: body length is not a cost bound`. The body was
never parsed. The limiter refused first and the report blamed the wrong control
— D-013's defect wearing a different mask, one sprint after D-013 was fixed.

Both now SKIP with a stated reason, and `report()` prints SKIP as its own state
outside the tally. A reader who takes "6/6" from a run where a probe could not
execute has been misled by the report, not the probe.

**The skip is not an absence of evidence.** The 429 *is* the limiter working in
production, confirmed directly with curl. T-1 is verified against the deployed
system — just not by the probe designed to trigger it. Watching a control
engage turned out to be better evidence than manufacturing the conditions for
it, and here it was the only evidence available.

## 4. The secret scanner caught its own author

S8-GUARD gave `check-config`, `check-docs` and `check-secrets` the root
argument they had always lacked. That was the finding in itself: those were
precisely the three guards with no failure test, because none could be pointed
at a fixture.

The scanner immediately failed the build on a plan document committed earlier
in the same sprint, which carried a literal `sk-live-...` string as a test
fixture. Invisible until the guard could scan a wider tree. The guard was
right; the document was the defect.

## 5. Retrospective

**What worked.** Testing against production rather than reasoning about it.
Every finding above required a real deployment and a real edge proxy; none was
available from localhost, and none would have been found by reading the code.

**What did not.** Two background agents were dispatched in parallel and both
died mid-task on a session rate limit. Their partial work was left in the tree
— one had broken `check-secrets` in a way that turned out to be correct, and
the failure it produced was a real defect in a different file. Verifying what a
stopped agent left behind, rather than assuming it left nothing, is what turned
that into a finding instead of a mystery.

**Committed improvement for Sprint 9.** A probe that cannot distinguish between
the thing it tests and something else must say so — never PASS, which was
D-013, and never FAIL, which blames a control that was never reached. This is
now the rule for every probe added to the harness.

## 6. Sign-off

| Approver | Role | Status |
|---|---|---|
| Sandeep Chavan | Release Authority | ☑ Deployed and verified live |
