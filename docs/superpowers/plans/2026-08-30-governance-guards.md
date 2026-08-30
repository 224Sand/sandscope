# Governance Guard Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two governance gaps that have each caused a defect twice — the traceability guard only catches over-claiming, and `PROJECT_RECORD.html` carries hand-typed figures.

**Architecture:** Both fixes follow the pattern the repo already uses: derive the truth from the repository, compare it to the claim, fail the build on a mismatch. The traceability guard gains a second direction (a `Planned` row whose test already exists and passes). `PROJECT_RECORD.html` gains generated figure spans, filled by the existing derive pipeline, so it cannot go stale a third time.

**Tech Stack:** Node ESM scripts in `scripts/`, Python `unittest` for the guard-of-the-guard tests, no new dependencies.

## Global Constraints

- No new dependencies.
- Every guard must be PROVEN to fail on a known-bad fixture before it is trusted. This is Definition of Done item 9 and the reason D-013 and D-015 exist. A guard only ever run against a passing tree has not been tested.
- Guard scripts accept an optional root argument (`process.argv[2]`) so they can be pointed at a fixture directory — follow the existing convention in `scripts/check-traceability.mjs:27`.
- A failing guard exits non-zero and prints what to fix, not just that something is wrong.
- Run all commands from the repository root unless stated otherwise.

---

### Task 1: Make the traceability guard bidirectional

**The defect this closes:** D-020. `check-traceability.mjs` fails the build when a row claims `Done` and its test does not exist. Nothing checks the reverse, so 20 requirements sat at `Planned` while already implemented and passing — and the public delivery page under-reported the work for months. D-014 was the same root cause in the other direction.

**Files:**
- Modify: `scripts/check-traceability.mjs:64-84`
- Test: `apps/agent/tests/test_guards_fail_on_bad_input.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `check-traceability.mjs` now reports two problem classes. Exit code and CLI shape are unchanged, so CI needs no edit.

- [ ] **Step 1: Write the failing guard-of-the-guard test**

Append to `apps/agent/tests/test_guards_fail_on_bad_input.py`:

```python
    def test_traceability_guard_catches_planned_with_a_passing_test(self) -> None:
        """D-020, in the direction nothing checked.

        A row sitting at Planned while the test it names already exists is how
        20 finished requirements stayed invisible. The guard caught the
        opposite mistake from the day it was written; this is the half that
        let the delivery page under-report for months.
        """
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            reqs = root / "docs/01-requirements"
            reqs.mkdir(parents=True)
            (reqs / "TRACEABILITY.md").write_text(
                "| ID | Requirement | Story | Test | Sprint | Status |\n"
                "|---|---|---|---|---|---|\n"
                "| FR-999 | A thing already built | S1 | `test_a_thing_that_exists` "
                "| 1 | Planned |\n"
            )
            tests = root / "apps/agent/tests"
            tests.mkdir(parents=True)
            (tests / "test_real.py").write_text(
                "def test_a_thing_that_exists() -> None:\n    assert True\n"
            )
            # The guard reads its corpus from `git ls-files`, so the fixture
            # must be a repository or the planted test is invisible to it.
            subprocess.run([str(GIT), "init", "-q"], cwd=tmp, check=True)  # noqa: S603
            subprocess.run([str(GIT), "add", "-A"], cwd=tmp, check=True)  # noqa: S603

            self.assertGuardFails(run("check-traceability.mjs", tmp), "FR-999")
```

Note the conventions this suite already uses, and match them rather than
introducing pytest fixtures: `unittest.TestCase`, an inline
`tempfile.TemporaryDirectory()`, the module-level `run(script, *args)` helper
which passes the fixture root as a positional argument, and
`self.assertGuardFails(result, expect)`. `GIT` and `Path` are already imported
at the top of the file.

If `_fixture_repo`, `_git_init` and `_run_guard` do not already exist in that file, read the existing tests in it and reuse whatever helpers they use — this suite already builds fixture repos for five other guards, and inventing a parallel helper would be worse than matching them.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/sand224/sandscope/apps/agent
.venv/bin/python -m pytest tests/test_guards_fail_on_bad_input.py -k planned_with_a_passing -q
```

Expected: FAIL — `the guard passed a Planned row whose test exists`. This is the bug, reproduced.

- [ ] **Step 3: Add the reverse check to the guard**

In `scripts/check-traceability.mjs`, replace this line:

```js
  if (row.status !== "Done") continue;
```

with:

```js
  // The OTHER direction, added after D-020. The guard has caught a `Done` row
  // with no test since the day it was written; nothing caught a `Planned` row
  // whose test already exists and passes, so 20 finished requirements stayed
  // invisible and the public delivery page under-reported for months.
  //
  // A hand-maintained status column drifts BOTH ways. Only checking the
  // flattering direction means the check is protecting the reader from
  // over-claiming and protecting nobody from the project undersellingelf.
  if (row.status === "Planned") {
    const named = (row.test.match(/[A-Za-z_][A-Za-z0-9_.\/-]{6,}/g) ?? []).filter(
      (t) => !/^https?/.test(t),
    );
    const exists = named.some((t) => {
      if (corpus.includes(t)) return true;
      try {
        return statSync(resolve(root, t)).isFile();
      } catch {
        return false;
      }
    });
    if (exists) {
      problems.push(
        `${row.id}: claims Planned but the test it names (${row.test}) already ` +
          `exists in the repository. If it passes, the row is Done; if it does ` +
          `not, name the test that is actually outstanding.`,
      );
    }
    continue;
  }

  if (row.status !== "Done") continue;
```

- [ ] **Step 4: Run the guard-of-the-guard test again**

```bash
cd /Users/sand224/sandscope/apps/agent
.venv/bin/python -m pytest tests/test_guards_fail_on_bad_input.py -k planned_with_a_passing -q
```

Expected: PASS.

- [ ] **Step 5: Run the guard against the real repository**

```bash
cd /Users/sand224/sandscope
node scripts/check-traceability.mjs
```

Expected: `traceability check passed: 61 requirements, 61 Done and each names a test that exists`.

Every row is currently `Done`, so the new branch is not exercised by the real tree — which is exactly why Step 2 mattered. If this FAILS, a row you did not expect is `Planned` and the guard just found a real D-020 recurrence; fix the row rather than the guard.

- [ ] **Step 6: Run the whole guard suite and commit**

```bash
cd /Users/sand224/sandscope/apps/agent
.venv/bin/python -m pytest tests/test_guards_fail_on_bad_input.py -q
cd /Users/sand224/sandscope
for c in check-traceability check-docs check-readme check-deploy-claims check-sprints check-secrets check-workflow-shell check-config; do node scripts/$c.mjs >/dev/null || echo "FAILED: $c"; done
git add scripts/check-traceability.mjs apps/agent/tests/test_guards_fail_on_bad_input.py
git commit -m "fix(guards): catch a Planned row whose test already exists (D-020)

The guard has failed the build on a Done row with no test since it was
written. Nothing caught the reverse, so 20 requirements sat at Planned while
already implemented and passing, and the public delivery page under-reported
for months.

A hand-maintained status column drifts both ways. Only checking the
flattering direction protects the reader from over-claiming and protects
nobody from the project underselling itself.

Proven by a fixture repo where a Planned row names a test that exists."
```

---

### Task 2: Generate PROJECT_RECORD.html's figures

**The defect this closes:** the tail of D-019 and D-020. Every other surface — `/delivery`, `README.md` — derives its numbers from `delivery.json` and is guarded. `PROJECT_RECORD.html` types them by hand, and has therefore gone stale twice: once claiming the app was undeployed a week after it went live, once carrying `13 done / 45 Planned` after an audit had moved the real numbers.

**Files:**
- Modify: `docs/00-governance/PROJECT_RECORD.html` (the figure sites)
- Create: `scripts/fill-project-record.mjs`
- Modify: `apps/web/scripts/prebuild.mjs:18-22`
- Test: `apps/agent/tests/test_guards_fail_on_bad_input.py`

**Interfaces:**
- Consumes: `apps/web/src/generated/delivery.json` (fields `requirements.total`, `requirements.done`, `requirements.planned`, `defects.total`, `defects.severityOne`, `tests.total`).
- Produces: `scripts/fill-project-record.mjs`, runnable standalone and from prebuild. Exits non-zero if a placeholder in the HTML has no matching field.

- [ ] **Step 1: Mark the figures in the HTML**

Find every hand-typed figure in `docs/00-governance/PROJECT_RECORD.html` and wrap it in a span naming the field it comes from. There are three known sites — confirm with:

```bash
cd /Users/sand224/sandscope
grep -nE "[0-9]+ total · [0-9]+ done|All [0-9]+ are|<strong>All [0-9]+ requirements" docs/00-governance/PROJECT_RECORD.html
```

Replace each figure like this:

```html
<!-- before -->
<div class="metaitem"><dt>Requirements</dt><dd>61 total · 61 done</dd></div>

<!-- after -->
<div class="metaitem"><dt>Requirements</dt><dd><span data-figure="requirements.total">61</span> total · <span data-figure="requirements.done">61</span> done</dd></div>
```

The number stays in the span so the document is still readable if the script never runs — an empty span would make the record worse than a stale one.

- [ ] **Step 2: Write the filler**

Create `scripts/fill-project-record.mjs`:

```js
/**
 * Fill PROJECT_RECORD.html's figures from the derived record.
 *
 * Every other surface -- /delivery and README.md -- derives its numbers and is
 * guarded. This document typed them by hand, and has gone stale twice: once
 * claiming the web app was undeployed a week after it went live (D-019), once
 * carrying 13 done / 45 Planned after an audit had moved the real numbers
 * (D-020). Two recurrences in one file is a pattern, not bad luck.
 *
 * Each figure is a `<span data-figure="path.to.field">` whose text is replaced
 * from delivery.json. The written number stays in the span so the document is
 * still readable if this never runs -- an empty span would be worse than a
 * stale one.
 *
 *   node scripts/fill-project-record.mjs           # rewrite in place
 *   node scripts/fill-project-record.mjs --check   # fail if any figure is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RECORD = resolve(root, "docs/00-governance/PROJECT_RECORD.html");
const checkOnly = process.argv.includes("--check");

const delivery = JSON.parse(
  readFileSync(resolve(root, "apps/web/src/generated/delivery.json"), "utf8"),
);

/** `requirements.done` -> the value, or undefined if the path is wrong. */
function lookup(path) {
  return path.split(".").reduce((node, key) => (node == null ? node : node[key]), delivery);
}

const html = readFileSync(RECORD, "utf8");
const stale = [];
let unknown = null;

const filled = html.replace(
  /<span data-figure="([a-zA-Z.]+)">([^<]*)<\/span>/g,
  (whole, path, current) => {
    const value = lookup(path);
    if (value === undefined) {
      unknown = path;
      return whole;
    }
    if (String(value) !== current) stale.push(`${path}: says ${current}, derived ${value}`);
    return `<span data-figure="${path}">${value}</span>`;
  },
);

if (unknown) {
  console.error(`fill-project-record: no field "${unknown}" in delivery.json`);
  process.exit(1);
}

const count = [...html.matchAll(/data-figure=/g)].length;
if (count === 0) {
  // A filler that silently fills nothing is the D-015 failure: a check that
  // reports success without having checked anything.
  console.error("fill-project-record: no data-figure spans found; the document has moved");
  process.exit(1);
}

if (checkOnly) {
  if (stale.length) {
    console.error(`PROJECT_RECORD figures are stale (${stale.length})\n`);
    for (const s of stale) console.error("  " + s);
    console.error("\n  Run: node scripts/fill-project-record.mjs");
    process.exit(1);
  }
  console.log(`project record check passed: ${count} figures match the derived record`);
} else {
  writeFileSync(RECORD, filled);
  console.log(`filled ${count} figures in PROJECT_RECORD.html`);
}
```

- [ ] **Step 3: Run it and confirm it fills**

```bash
cd /Users/sand224/sandscope
node scripts/derive-delivery.mjs >/dev/null
node scripts/fill-project-record.mjs
node scripts/fill-project-record.mjs --check
```

Expected: `filled 3 figures`, then `project record check passed: 3 figures match the derived record`.

- [ ] **Step 4: Prove the check can fail**

```bash
cd /Users/sand224/sandscope
sed -i '' 's|<span data-figure="requirements.done">61</span>|<span data-figure="requirements.done">13</span>|' docs/00-governance/PROJECT_RECORD.html
node scripts/fill-project-record.mjs --check
```

Expected: FAIL — `requirements.done: says 13, derived 61`. That is exactly the D-020 state this guard exists to catch.

- [ ] **Step 5: Restore and wire into prebuild**

```bash
cd /Users/sand224/sandscope
node scripts/fill-project-record.mjs
node scripts/fill-project-record.mjs --check
```

Then in `apps/web/scripts/prebuild.mjs`, add the filler to the script list so the document is refreshed whenever the record is:

```js
const scripts = [
  "../../scripts/derive-delivery.mjs",
  "../../scripts/derive-surfaces.mjs",
  "../../scripts/derive-council.mjs",
  "../../scripts/fill-project-record.mjs",
];
```

- [ ] **Step 6: Add the check to CI**

In `.github/workflows/ci.yml`, in the `governance` job, after the README check step:

```yaml
      - name: Project record check (figures match the derived record)
        run: node scripts/fill-project-record.mjs --check
```

Then verify the workflow still parses:

```bash
cd /Users/sand224/sandscope
node scripts/check-workflow-shell.mjs
```

Expected: `workflow shell check passed`.

- [ ] **Step 7: Run everything and commit**

```bash
cd /Users/sand224/sandscope
for c in check-traceability check-docs check-readme check-deploy-claims check-sprints check-secrets check-workflow-shell check-config; do node scripts/$c.mjs >/dev/null || echo "FAILED: $c"; done
node scripts/fill-project-record.mjs --check
git add scripts/fill-project-record.mjs docs/00-governance/PROJECT_RECORD.html apps/web/scripts/prebuild.mjs .github/workflows/ci.yml
git commit -m "fix(docs): generate PROJECT_RECORD's figures instead of typing them

Every other surface derives its numbers and is guarded. This document typed
them by hand and has gone stale twice in the same file -- once claiming the
web app was undeployed a week after it went live (D-019), once carrying
13 done / 45 Planned after an audit had moved the real numbers (D-020).

Two recurrences in one file is a pattern, not bad luck.

Figures are now data-figure spans filled from delivery.json, with --check
wired into CI. Proven by setting a figure to 13 and watching it fail."
```

---

### Task 3: Record both fixes in the defect log

The log is the project's most-read artefact and both defects say "guard extension open". They are no longer open.

**Files:**
- Modify: `docs/04-quality/DEFECT_LOG.md` (the D-020 row, and the D-019/D-022 status notes)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Update the D-020 row's status**

Find the D-020 row and change its Status cell from:

```
| Fixed (rows and HTML figures corrected); guard extension for the reverse direction, and generating PROJECT_RECORD.html's figures rather than typing them, are both open |
```

to:

```
| Fixed, guarded — `check-traceability.mjs` now fails on a Planned row whose test exists, and PROJECT_RECORD.html's figures are generated from delivery.json with `--check` in CI |
```

- [ ] **Step 2: Regenerate and verify the derived counts still agree**

```bash
cd /Users/sand224/sandscope
node scripts/derive-delivery.mjs
node scripts/fill-project-record.mjs
node scripts/check-readme.mjs
node scripts/fill-project-record.mjs --check
```

Expected: all pass. The defect count is unchanged (no new defect — these are fixes to existing ones), so README needs no edit.

- [ ] **Step 3: Commit**

```bash
cd /Users/sand224/sandscope
git add docs/04-quality/DEFECT_LOG.md docs/00-governance/PROJECT_RECORD.html apps/web/src/generated/delivery.json
git commit -m "docs: close out D-020's two open guard extensions

Both directions of the traceability check now exist, and PROJECT_RECORD's
figures are generated. The log said 'open' for both; it no longer should."
```

---

## Self-Review

**Spec coverage:** Two gaps were named — the one-directional traceability guard and the hand-typed PROJECT_RECORD figures. Task 1 closes the first, Task 2 the second, Task 3 records both. Covered.

**Placeholder scan:** No TBDs. Both scripts are written in full. The one deliberate instruction-rather-than-code is Task 1 Step 1's note to reuse the existing fixture helpers — inventing parallel helpers when five other guard tests already build fixture repos would be worse than matching what is there, and the exact helper names cannot be quoted without reading that file.

**Type consistency:** `lookup(path)` and the `data-figure` attribute name are used identically in Task 2 Steps 1–6. `check-traceability.mjs`'s `problems`, `corpus`, `root` and `statSync` are all pre-existing bindings in that file's scope — the inserted block uses them exactly as the surrounding code does.

**Known risk:** Task 2 Step 1 assumes three figure sites. If `grep` finds more, wrap all of them — the count assertion in the script (`count === 0`) only catches zero, not "fewer than expected", because there is no correct fixed number for a document that may gain figures.
