# Sprint 8 Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five open Sprint 8 items so the last open sprint can reach its release gate.

**Architecture:** Four of the five are additive and independent. The fifth — running pen tests against the deployed system — is NOT a matter of changing a URL: the harness carries an explicit note that it must never be pointed at production, because its per-probe IP isolation is meaningless behind Vercel. That constraint is real and this plan works with it rather than around it, by splitting the probes into those that are valid remotely and those that are not.

**Tech Stack:** Python `httpx` (already a dependency), `unittest`/`pytest`, Markdown for the runbook. No new dependencies.

## Global Constraints

- No new dependencies.
- Every guard proven to fail on known-bad input before it is trusted (DoD item 9).
- The live system is `https://sandscope-web.vercel.app` (BFF) and `https://p01--sandscope-agent--ql6pdjy9fhnj.code.run` (runtime). Never commit either token.
- A probe that cannot produce a meaningful result against a target must SKIP with a stated reason, never pass. A green result that means "not applicable" is the D-013 defect.
- Run from repository root unless stated otherwise.

---

### Task 1: Complete the guard-of-the-guard coverage (S8-GUARD)

Five of the eight check scripts have a test proving they fail on bad input. Three do not: `check-config.mjs`, `check-docs.mjs`, `check-secrets.mjs`. An unproven guard is the D-015 defect waiting to happen — that one could not fail at all and nobody knew for four sprints.

**Files:**
- Modify: `apps/agent/tests/test_guards_fail_on_bad_input.py`

**Interfaces:**
- Consumes: the existing fixture helpers in that file (read them first; do not invent parallel ones).
- Produces: three new tests. Nothing else consumes them.

- [ ] **Step 1: Read what the three guards actually check**

```bash
cd /Users/sand224/sandscope
head -30 scripts/check-config.mjs
head -30 scripts/check-secrets.mjs
grep -nE "problems.push|console.error" scripts/check-docs.mjs | head
```

Write down, for each, the single most important thing it catches. That is what the fixture must break.

- [ ] **Step 2: Write the three failing tests**

Append to `apps/agent/tests/test_guards_fail_on_bad_input.py`, matching the helper names you found in the existing tests:

```python
    def test_secret_scan_catches_a_credential_in_a_committed_file(self) -> None:
        """DoD item 4. A scanner that has never seen a secret has never been
        tested against one, and this is the guard whose failure is least
        recoverable: a leaked key is public the moment the push lands."""
        with tempfile.TemporaryDirectory() as tmp:
            planted = Path(tmp) / "apps/web/src/lib/leak.ts"
            planted.parent.mkdir(parents=True)
            planted.write_text(
                'export const KEY = "sk-live-0123456789abcdef0123456789abcdef";\n'
            )
            subprocess.run([str(GIT), "init", "-q"], cwd=tmp, check=True)  # noqa: S603
            subprocess.run([str(GIT), "add", "-A"], cwd=tmp, check=True)  # noqa: S603

            self.assertGuardFails(run("check-secrets.mjs", tmp), "leak.ts")

    def test_config_guard_catches_a_slug_that_does_not_derive(self) -> None:
        """FR-001. The product name is authored in exactly one place and the
        slug is derived from it; a hand-edited slug that disagrees is how a
        rename half-lands."""
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "product.config.json").write_text(
                json.dumps(
                    {
                        "name": "SandScope",
                        "slug": "something-else",
                        "wordmark": "SANDSCOPE",
                        "repo": "224Sand/sandscope",
                    }
                )
            )
            self.assertGuardFails(run("check-config.mjs", tmp), "slug")

    def test_docs_guard_catches_a_requirement_with_no_test(self) -> None:
        """Charter section 11: a requirement with no test is a defect in the
        process. The guard must refuse an EMPTY Test cell, not only a wrong
        one."""
        with tempfile.TemporaryDirectory() as tmp:
            reqs = Path(tmp) / "docs/01-requirements"
            reqs.mkdir(parents=True)
            (reqs / "TRACEABILITY.md").write_text(
                "| ID | Requirement | Story | Test | Sprint | Status |\n"
                "|---|---|---|---|---|---|\n"
                "| FR-998 | A thing with no test | S1 |  | 1 | Planned |\n"
            )
            self.assertGuardFails(run("check-docs.mjs", tmp), "FR-998")
```

Match the suite's existing conventions exactly — `unittest.TestCase`, an
inline `tempfile.TemporaryDirectory()`, the module-level `run(script, *args)`
helper that passes the fixture root positionally, and
`self.assertGuardFails(result, expect)`. `json`, `subprocess`, `Path` and
`GIT` are already imported at the top of that file.

**None of these three accepts a root argument yet — verified, not assumed:**

```bash
cd /Users/sand224/sandscope
grep -c "process.argv" scripts/check-config.mjs scripts/check-docs.mjs scripts/check-secrets.mjs
# check-config.mjs:0   check-docs.mjs:0   check-secrets.mjs:0
```

So the tests above cannot run until each takes one. **This is the actual
finding of the task**, and it is not incidental: these are precisely the three
guards with no failure test, and the reason is that none of them can be pointed
at anything but the real repository. A guard that can only be run against a
passing tree cannot be proven to fail — which is how D-015 shipped a README
checker that could never fail at all.

Add the override to each, following the pattern already in
`scripts/check-traceability.mjs:27`:

```js
// An optional root lets the guard be pointed at a fixture and observed to
// FAIL, which is Definition of Done item 9. A guard that has only ever been
// run against a passing tree has not been tested.
const root = resolve(process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), ".."));
```

Then replace every path the script builds from its own location with one
resolved against `root`. Run the guard against the real repository afterwards
to confirm the default path still works:

```bash
cd /Users/sand224/sandscope
node scripts/check-config.mjs && node scripts/check-docs.mjs && node scripts/check-secrets.mjs
```

- [ ] **Step 3: Run them and record which fail**

```bash
cd /Users/sand224/sandscope/apps/agent
.venv/bin/python -m pytest tests/test_guards_fail_on_bad_input.py -q -k "secret_scan or config_guard or docs_guard"
```

Any test that FAILS here has found a real hole in that guard. Any that passes means the guard already catches it and you have added coverage. Both outcomes are worth having; do not adjust a test to make it pass.

- [ ] **Step 4: Fix any guard that let its fixture through**

If, for example, `check-secrets.mjs` passed the planted key, the guard has a real gap — widen its pattern or its file coverage until the fixture fails, then re-run. Record what was wrong in the commit message; a guard that was not catching what it claimed is a defect and belongs in `docs/04-quality/DEFECT_LOG.md` as one.

- [ ] **Step 5: Run the full suite and commit**

```bash
cd /Users/sand224/sandscope/apps/agent
.venv/bin/python -m pytest tests/ -q
cd /Users/sand224/sandscope
git add apps/agent/tests/test_guards_fail_on_bad_input.py scripts/
git commit -m "test(guards): prove the last three check scripts can fail (S8-GUARD)

check-config, check-docs and check-secrets had no test asserting they fail on
bad input. Five of eight guards had one; these three did not, which is the
D-015 shape: a guard that has only ever run against a passing tree has not
been tested.

The secret scanner is the one that matters most — a leaked key is public the
moment the push lands, so a scanner that has never seen a secret is the least
acceptable place for an unproven check."
```

---

### Task 2: Split the pen tests by what is valid remotely (S8-E2E)

**Read this before touching the file.** `apps/agent/scripts/pentest.py:62-66` says:

> This only works against a local target. Behind Vercel the header is overwritten at the edge, which is precisely why the application is allowed to trust it — and why this harness must never be pointed at production and read as proof the limiter can be bypassed.

S8-E2E's acceptance criterion is "6/6 against public URLs, not localhost". Taken literally, that instructs you to do the thing the harness explicitly forbids. The criterion is right about the goal — controls should be verified where they actually run — and wrong about the method for one probe. Resolve it by splitting, not by ignoring either side.

**Files:**
- Modify: `apps/agent/scripts/pentest.py`
- Create: `docs/05-security/PENTEST_RESULTS.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `pentest.py --target <url> [--remote]`. `--remote` marks probes that cannot be trusted against a hosted target as SKIPPED with a reason, rather than letting them report a meaningless pass.

- [ ] **Step 1: Classify each probe**

The five probes and whether each is valid against production:

| Probe | Checks | Valid remotely? |
|---|---|---|
| P-1 | Runtime rejects an unauthenticated call | **Yes** — auth is the runtime's own, unaffected by the edge |
| P-2 | Inter-service token absent from the browser bundle | **Yes** — it is the shipped bundle being read |
| P-7 | Oversized body refused before a model call | **Yes** — the BFF's own cap |
| P-3 | Per-IP limit engages | **No** — per-probe `x-forwarded-for` is overwritten at the Vercel edge |
| P-5 | Prompt injection does not change behaviour | **Yes**, but costs a real model call — gate behind an explicit flag |

- [ ] **Step 2: Add the flag and the skip**

In `pentest.py`, add to `main()`'s parser:

```python
    parser.add_argument(
        "--remote",
        action="store_true",
        help="target is a hosted deployment; probes that cannot produce a "
        "meaningful result behind an edge proxy are SKIPPED rather than passed",
    )
```

Change the `run` signature to `def run(target: str, runtime: str | None, remote: bool = False) -> list[Finding]:` and update the call in `main()` to `run(args.target.rstrip("/"), ..., remote=args.remote)`.

Then, at P-3's site, guard it:

```python
    # P-3: the per-IP limit must engage.
    #
    # Local only, and this is not a limitation to route around. Each probe
    # sends its own `x-forwarded-for` so the probes do not contaminate each
    # other -- behind Vercel that header is overwritten at the edge, which is
    # exactly why the application is allowed to trust it. Running this against
    # production would exercise the harness's own address, not the control, and
    # a green result would mean nothing while looking like proof.
    #
    # Skipping with a reason rather than passing is the D-013 lesson: that pen
    # test reported success while the service was DOWN, because its condition
    # could not tell "refused correctly" from "not running".
    if remote:
        findings.append(
            Finding(
                id="P-3",
                name="per-IP rate limit engages",
                # `threat` is required -- the real dataclass is
                # (id, name, threat, passed, detail). Read it at
                # apps/agent/scripts/pentest.py:26 before editing.
                threat="T-1",
                passed=True,
                skipped=True,
                detail=(
                    "SKIPPED against a hosted target. Per-probe x-forwarded-for is "
                    "overwritten at the edge, so this can only be verified locally "
                    "or by inspecting the limiter's own metrics."
                ),
            )
        )
    else:
        ...  # the existing P-3 body, unchanged
```

If `Finding` has no `skipped` field, add one with a default:

```python
@dataclass
class Finding:
    id: str
    name: str
    threat: str
    passed: bool
    detail: str
    skipped: bool = False
```

The first five fields already exist; only `skipped` is new, and it takes a
default so no existing construction site needs editing.

and update `report()` so a skipped finding prints as `SKIP` and does not count toward the pass tally — a skip must be visible in the output, never silently folded into a pass.

- [ ] **Step 3: Run locally and confirm nothing regressed**

```bash
cd /Users/sand224/sandscope/apps/agent
# start the runtime locally first if it is not already up
.venv/bin/python scripts/pentest.py --target http://127.0.0.1:3000
```

Expected: the same result as before this change — no probe skipped, all report as they did.

- [ ] **Step 4: Run against the deployed system**

```bash
cd /Users/sand224/sandscope/apps/agent
.venv/bin/python scripts/pentest.py \
  --target https://sandscope-web.vercel.app \
  --remote
```

Expected: P-1, P-2, P-7 report real results; P-3 reports SKIP with its reason. Record whatever you actually get — if a probe FAILS against production, that is a genuine finding and the most valuable output of this whole plan.

- [ ] **Step 5: Write the results up**

Create `docs/05-security/PENTEST_RESULTS.md` recording: the date, the exact commands, each probe's result, and — for P-3 — why it is skipped rather than passed. Copy the real terminal output rather than describing it.

- [ ] **Step 6: Commit**

```bash
cd /Users/sand224/sandscope
git add apps/agent/scripts/pentest.py docs/05-security/PENTEST_RESULTS.md
git commit -m "feat(security): make the pen tests honest against a hosted target (S8-E2E)

S8-E2E asks for 6/6 against public URLs. The harness carries an explicit note
that it must never be pointed at production, because each probe sends its own
x-forwarded-for and Vercel overwrites that at the edge. The criterion is right
about the goal and wrong about the method for one probe.

Split rather than ignoring either: P-1, P-2 and P-7 now run against the
deployed system for real; P-3 SKIPS with its reason instead of reporting a
pass that would mean nothing.

That distinction is D-013's whole lesson — that pen test reported success
while the service was down, because it could not tell 'refused correctly'
from 'not running'."
```

---

### Task 3: Re-test the threat model against the deployed surface (S8-THREAT)

17 threats were assessed against a design. Some are now testable against a running system, which is a different question.

**Files:**
- Modify: `docs/05-security/THREAT_MODEL.md` (add a verification column or a dated section)

**Interfaces:**
- Consumes: Task 2's `PENTEST_RESULTS.md` where a threat maps to a probe.
- Produces: nothing.

- [ ] **Step 1: Walk each threat and decide its status**

For each of T-1 … T-17, mark one of exactly three states. Do not invent a fourth:

- **Verified** — a probe, test or live observation confirms the control works. Name it.
- **Deferred** — cannot be tested here, with the reason and what would change that.
- **Accepted** — the risk is real and taken deliberately. The threat model already records several of these (T-14, T-15, T-17); leave them as they are.

- [ ] **Step 2: Test the ones that are now testable**

At minimum these three, which need only curl:

```bash
# T-3: the runtime rejects an unauthenticated call
curl -s -o /dev/null -w "T-3 unauthenticated runtime call: %{http_code}\n" \
  https://p01--sandscope-agent--ql6pdjy9fhnj.code.run/v1/providers

# T-12: the inter-service token must not appear in the shipped bundle
curl -s https://sandscope-web.vercel.app/ | grep -c "AGENT_SERVICE_TOKEN" \
  | sed 's/^/T-12 token occurrences in the page: /'

# T-9: no raw IP echoed back to the client
curl -s -D- -o /dev/null https://sandscope-web.vercel.app/ | grep -iE "x-forwarded|client-ip" \
  | sed 's/^/T-9 address headers echoed: /' || echo "T-9 address headers echoed: none"
```

Expected: T-3 → `401`. T-12 → `0`. T-9 → none.

- [ ] **Step 3: Record the results with the date**

Add a dated section to `THREAT_MODEL.md` — do not edit the original assessment in place. The original was a design-time judgement and remains true as a record of what was believed then; overwriting it would destroy the comparison that makes this exercise worth doing.

- [ ] **Step 4: Commit**

```bash
cd /Users/sand224/sandscope
git add docs/05-security/THREAT_MODEL.md
git commit -m "docs(security): re-test the threat model against the deployed surface (S8-THREAT)

17 threats were assessed against a design. Recorded here is which are now
Verified against the running system, which are Deferred and why, and which
remain deliberately Accepted.

Added as a dated section rather than edited in place: the original was a
design-time judgement and is still a true record of what was believed then.
Overwriting it would destroy the comparison that makes the re-test useful."
```

---

### Task 4: Document the load ceiling (S8-LOAD)

Acceptance: "documented ceiling; the failure mode is refusal, not cost."

**Files:**
- Create: `docs/06-operations/LOAD_CEILING.md`

**Interfaces:**
- Consumes: `apps/web/src/lib/env.ts` (`perIpLimit`), `apps/agent/sandscope_agent/api/app.py` (`RUN_BUDGET_USD`).
- Produces: nothing.

- [ ] **Step 1: Read the real limits rather than estimating**

```bash
cd /Users/sand224/sandscope
grep -n "PER_IP_RATE_LIMIT_PER_HOUR\|perIpLimit" apps/web/src/lib/env.ts
grep -n "RUN_BUDGET_USD" apps/agent/sandscope_agent/api/app.py | head -3
grep -n "MAX_BODY_BYTES" apps/web/src/app/api/runs/stream/route.ts
```

- [ ] **Step 2: Write the document**

Create `docs/06-operations/LOAD_CEILING.md` stating, with the real numbers: requests per IP per hour, the per-run spend ceiling, the body cap, and — the part that matters — what happens at each ceiling. Every one of them refuses; none of them bills. Say which component enforces each and name the test that asserts it.

- [ ] **Step 3: Verify the refusal claim rather than asserting it**

```bash
cd /Users/sand224/sandscope/apps/agent
.venv/bin/python -m pytest tests/ -q -k "budget or rate or limit" 2>&1 | tail -3
cd ../web && npm run test:unit 2>&1 | tail -4
```

Cite the specific tests in the document. A ceiling document that says "it refuses" without naming what proves it is the thing this project keeps writing guards against.

- [ ] **Step 4: Commit**

```bash
cd /Users/sand224/sandscope
git add docs/06-operations/LOAD_CEILING.md
git commit -m "docs(ops): document the load ceiling and its failure mode (S8-LOAD)

Every ceiling in this system refuses rather than bills: the per-IP limit, the
per-run spend guard and the body cap. Each is named with the component that
enforces it and the test that asserts it, because a ceiling document that
says 'it refuses' without naming the proof is the claim this project spends
its guards refusing to make."
```

---

### Task 5: Write the runbook (S8-OBS)

Acceptance: "every fault in the threat model reaches a documented response."

**Files:**
- Create: `docs/06-operations/RUNBOOK.md`

**Interfaces:**
- Consumes: `docs/05-security/THREAT_MODEL.md` (updated in Task 3).
- Produces: nothing.

- [ ] **Step 1: Enumerate what can actually go wrong in production**

Not hypotheticals — the failure modes this system has or can have: the runtime asleep on the free tier, a provider rate-limiting, Redis unreachable (the limiter fails closed, so the site refuses), the database unreachable (runs stream but do not persist), spend ceiling reached, corpus failing to load at startup.

- [ ] **Step 2: For each, write symptom → check → response**

Use the real commands:

```bash
# is the runtime up?
curl -s https://p01--sandscope-agent--ql6pdjy9fhnj.code.run/healthz

# which providers are available right now?
curl -s https://sandscope-web.vercel.app/api/providers
```

- [ ] **Step 3: Cross-check against the threat model**

Every threat with a response that a human would have to perform needs a row here. Verify none is missing by listing the threat IDs in the runbook and diffing against `THREAT_MODEL.md`.

- [ ] **Step 4: Commit**

```bash
cd /Users/sand224/sandscope
git add docs/06-operations/RUNBOOK.md
git commit -m "docs(ops): runbook covering every fault with a human response (S8-OBS)

Symptom, check command, response — for the failure modes this system actually
has: a sleeping runtime, a rate-limited provider, an unreachable limiter
(refuses by design), an unreachable database (streams but does not persist),
and the spend ceiling."
```

---

### Task 6: Close the sprint

**Files:**
- Modify: `docs/00-governance/SPRINT_08_PLAN.md`
- Create: `docs/00-governance/SPRINT_08_REVIEW.md`

- [ ] **Step 1: Mark the five items Done in the plan**

Update S8-E2E, S8-GUARD, S8-OBS, S8-THREAT and S8-LOAD from `Ready`/`Blocked on deploy` to `Done`.

- [ ] **Step 2: Write the review, matching the format of the other seven**

```bash
cd /Users/sand224/sandscope
head -40 docs/00-governance/SPRINT_07_REVIEW.md
```

Match that structure exactly. Note that `derive-delivery.mjs` parses `**Sprint:**`, `**Release:**` and velocity from these files — a review that does not match the format will silently produce an empty row on `/delivery`.

- [ ] **Step 3: Verify the delivery surface picks it up**

```bash
cd /Users/sand224/sandscope
node scripts/derive-delivery.mjs
node -e "const d=require('./apps/web/src/generated/delivery.json'); console.log(d.sprints.map(s=>s.number+': '+s.name+' — '+s.velocity).join('\n'))"
```

Expected: a sprint 8 row with a real commit count, not an empty name.

- [ ] **Step 4: Run every guard and commit**

```bash
cd /Users/sand224/sandscope
node scripts/check-sprints.mjs
for c in check-traceability check-docs check-readme check-deploy-claims check-secrets check-workflow-shell check-config; do node scripts/$c.mjs >/dev/null || echo "FAILED: $c"; done
git add docs/00-governance/
git commit -m "docs(sprint): close Sprint 8 — Hardening and Release

All five remaining items done: pen tests against the deployed system with an
honest skip, guard-of-the-guard coverage completed, threat model re-tested
live, load ceiling documented, runbook written."
```

---

## Self-Review

**Spec coverage:** Five open items — S8-E2E (Task 2), S8-GUARD (Task 1), S8-OBS (Task 5), S8-THREAT (Task 3), S8-LOAD (Task 4) — plus Task 6 to close the sprint. Covered.

**Placeholder scan:** No TBDs. The one place I deliberately do not write the content is Task 5's runbook rows and Task 4's document body — those depend on values you must read from the source in the step before, and inventing them here would be exactly the fabrication this project is built against. Every command that produces those values is given.

**Type consistency:** `Finding` gains one field (`skipped: bool = False`) in Task 2 Step 2 and is used with that name in the same step's `findings.append`. `run(target, runtime, remote)` is declared and called consistently. No other cross-task identifiers.

**Known risk, and the most important thing in this plan:** Task 2 contradicts S8-E2E's literal wording on purpose. If a reviewer wants 6/6 against production including P-3, that is a request to report a number the harness cannot honestly produce. Push back with the comment at `pentest.py:62`, or change the architecture so the limit is verifiable remotely — do not change the probe to make it pass.
