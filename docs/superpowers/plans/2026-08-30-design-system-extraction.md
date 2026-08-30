# Design System Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 395 inline `style={{}}` declarations into named CSS classes, and add a guard so the count can only go down.

**Architecture:** The repo already has a complete token system (23 tokens, zero arbitrary spacing values) — the failure is that components reach for tokens through inline objects instead of through named classes. Work outside-in: extract the handful of shapes that repeat most across files first (they pay for themselves immediately), then the per-component clusters. A ratchet test locks in each gain.

**Tech Stack:** Next.js 16 App Router, plain CSS in `apps/web/src/app/globals.css` (no CSS-in-JS, no Tailwind), Playwright for visual regression, Python `unittest` for the ratchet.

## Global Constraints

- No new dependencies. The project audits clean at 0 vulnerabilities and adding a CSS library to solve a discipline problem would be a regression.
- No visual change. Every task must leave the rendered page byte-identical in layout; this is a refactor, not a redesign.
- Tokens only. A extracted class may not introduce a raw value that is not already a token — if a value has no token, add the token first.
- Both themes. Any class touching colour must resolve through tokens so light and dark both work (`globals.css` defines the full palette on bare `:root`).
- `npm run typecheck`, `npm run test:e2e` and `npm run test:unit` must pass before every commit.
- Run all commands from `apps/web/` unless the path says otherwise.

---

### Task 1: Lock the current state with a ratchet test

Extraction without a ratchet regresses within two sprints — the next person adds `style={{ marginBottom: "var(--s4)" }}` because it is one line. This task adds the test FIRST so every later task has something to move.

**Files:**
- Create: `apps/agent/tests/test_inline_style_budget.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `INLINE_STYLE_BUDGET` (int) in the test module — later tasks lower this number and nothing else reads it.

- [ ] **Step 1: Count the current inline styles**

```bash
cd /Users/sand224/sandscope
grep -rho 'style={{' apps/web/src --include='*.tsx' | wc -l
```

Expected: `395`. If it differs, use the number you get — the budget must start at the real count, not an aspirational one.

- [ ] **Step 2: Write the failing test**

Create `apps/agent/tests/test_inline_style_budget.py`:

```python
"""The inline-style count may go down and never up.

A design system whose values live in 395 inline objects is not a design
system; it is the same scattered values with a token-shaped syntax. The
extraction is gradual because a nine-file rewrite is unreviewable, so this
holds the line between passes.

Set deliberately as a RATCHET rather than a target. A target invites someone
to argue the number down; a ratchet just fails, and lowering it is the visible
act of having improved something.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / "apps/web/src"

#: Lowered by each extraction task. Never raised. If a change genuinely needs
#: a new inline style, extract two others in the same commit.
INLINE_STYLE_BUDGET = 395


def count_inline_styles() -> int:
    result = subprocess.run(  # noqa: S603
        [
            "grep", "-rho", "style={{",
            "--include=*.tsx",
            str(WEB),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    return len([line for line in result.stdout.splitlines() if line.strip()])


def test_inline_styles_never_increase() -> None:
    actual = count_inline_styles()
    assert actual <= INLINE_STYLE_BUDGET, (
        f"{actual} inline style objects, budget is {INLINE_STYLE_BUDGET}. "
        "Extract the value into a class in globals.css rather than raising this."
    )


def test_the_budget_is_not_stale() -> None:
    """A ratchet nobody tightens is a ratchet that does nothing.

    If the real count has fallen more than 20 below the budget, the budget is
    lying about where the line is — lower it in the same commit as the
    extraction that earned it.
    """
    actual = count_inline_styles()
    assert actual > INLINE_STYLE_BUDGET - 20, (
        f"only {actual} inline styles against a budget of {INLINE_STYLE_BUDGET}. "
        "Lower INLINE_STYLE_BUDGET to the real number."
    )
```

Note: `sys` is imported for parity with the other subprocess tests in this suite but is unused here — delete the import if ruff flags it.

- [ ] **Step 3: Run the test and confirm it passes at the current count**

```bash
cd /Users/sand224/sandscope/apps/agent
.venv/bin/python -m pytest tests/test_inline_style_budget.py -q
```

Expected: 2 passed. If `test_the_budget_is_not_stale` fails, your Step-1 count and the constant disagree — set the constant to the Step-1 number.

- [ ] **Step 4: Prove the ratchet can fail**

Temporarily lower the budget and confirm the guard fires — a guard only ever run against a passing tree has not been tested (this repo's D-013 and D-015).

```bash
cd /Users/sand224/sandscope/apps/agent
sed -i '' 's/INLINE_STYLE_BUDGET = 395/INLINE_STYLE_BUDGET = 10/' tests/test_inline_style_budget.py
.venv/bin/python -m pytest tests/test_inline_style_budget.py::test_inline_styles_never_increase -q
```

Expected: FAIL, with `395 inline style objects, budget is 10`.

- [ ] **Step 5: Restore the budget**

```bash
cd /Users/sand224/sandscope/apps/agent
sed -i '' 's/INLINE_STYLE_BUDGET = 10/INLINE_STYLE_BUDGET = 395/' tests/test_inline_style_budget.py
.venv/bin/python -m pytest tests/test_inline_style_budget.py -q
```

Expected: 2 passed.

- [ ] **Step 6: Lint, format, commit**

```bash
cd /Users/sand224/sandscope/apps/agent
.venv/bin/python -m ruff check tests/test_inline_style_budget.py
.venv/bin/python -m ruff format tests/test_inline_style_budget.py
cd /Users/sand224/sandscope
git add apps/agent/tests/test_inline_style_budget.py
git commit -m "test: ratchet the inline-style count so extraction cannot regress

395 inline style objects across 18 files is the one failing category in the
design-system audit. The extraction is gradual because a nine-file rewrite is
unreviewable, so this holds the line between passes.

Proven by lowering the budget to 10 and watching it fail, then restoring."
```

---

### Task 2: Extract the page shell

`paddingTop: var(--s8); paddingBottom: var(--s10)` appears on 7 page roots. It is the single most repeated shape and the least contentious to move.

**Files:**
- Modify: `apps/web/src/app/globals.css` (append)
- Modify: `apps/web/src/app/{data,council,delivery,reliability,architecture,handover,console}/page.tsx`
- Modify: `apps/agent/tests/test_inline_style_budget.py:24`

**Interfaces:**
- Consumes: `INLINE_STYLE_BUDGET` from Task 1.
- Produces: CSS class `.surface` — a page root with the standard vertical rhythm. Later tasks assume it exists and do not redefine it.

- [ ] **Step 1: Capture a before-screenshot for one page**

```bash
cd /Users/sand224/sandscope/apps/web
npm run build && (npm run start -- --port 3000 &) && sleep 6
cat > /tmp/before.mjs <<'EOF'
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1200,height:900}, colorScheme:'dark' })).newPage();
await p.goto('http://127.0.0.1:3000/delivery', { waitUntil:'load' });
await p.screenshot({ path:'/tmp/delivery-before.png', fullPage:false });
await b.close();
EOF
node /tmp/before.mjs
```

- [ ] **Step 2: Add the class**

Append to `apps/web/src/app/globals.css`:

```css
/* ───────────────────────────────────────────────────────── page shell
   The standard vertical rhythm for a full-page surface. Was repeated as an
   inline object on seven page roots, which meant changing the rhythm meant
   editing seven files and hoping none was missed. */
.surface {
  padding-top: var(--s8);
  padding-bottom: var(--s10);
}
```

- [ ] **Step 3: Apply it to all seven pages**

In each of `src/app/{data,council,delivery,reliability,architecture,handover,console}/page.tsx`, find the `<main>` element and replace:

```tsx
<main className="voice-proof wrap" style={{ paddingTop: "var(--s8)", paddingBottom: "var(--s10)" }}>
```

with:

```tsx
<main className="voice-proof wrap surface">
```

The `handover` page's main is `className="voice-proof wrap kt"` — it becomes `className="voice-proof wrap kt surface"`. Keep every other class exactly as it was.

- [ ] **Step 4: Verify nothing moved**

```bash
cd /Users/sand224/sandscope/apps/web
npm run typecheck
pkill -f "next start"; npm run build && (npm run start -- --port 3000 &) && sleep 6
cat > /tmp/after.mjs <<'EOF'
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1200,height:900}, colorScheme:'dark' })).newPage();
await p.goto('http://127.0.0.1:3000/delivery', { waitUntil:'load' });
await p.screenshot({ path:'/tmp/delivery-after.png', fullPage:false });
await b.close();
EOF
node /tmp/after.mjs
cmp /tmp/delivery-before.png /tmp/delivery-after.png && echo "IDENTICAL" || echo "PIXELS MOVED — investigate before continuing"
```

Expected: `IDENTICAL`. If pixels moved, a page had a different padding value than assumed — revert that one page and handle it separately.

- [ ] **Step 5: Run the full suites**

```bash
cd /Users/sand224/sandscope/apps/web
npm run test:e2e
```

Expected: 247 passed, 20 skipped.

- [ ] **Step 6: Lower the ratchet**

```bash
cd /Users/sand224/sandscope
NEW=$(grep -rho 'style={{' apps/web/src --include='*.tsx' | wc -l | tr -d ' ')
echo "new count: $NEW"   # expect 388
sed -i '' "s/INLINE_STYLE_BUDGET = 395/INLINE_STYLE_BUDGET = $NEW/" apps/agent/tests/test_inline_style_budget.py
cd apps/agent && .venv/bin/python -m pytest tests/test_inline_style_budget.py -q
```

Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
cd /Users/sand224/sandscope
git add apps/web/src/app/globals.css apps/web/src/app apps/agent/tests/test_inline_style_budget.py
git commit -m "refactor(css): extract the page shell into .surface

paddingTop/paddingBottom repeated identically on seven page roots, so
changing the page rhythm meant editing seven files and hoping none was
missed. Screenshot-compared before and after: byte-identical.

395 -> 388 inline styles."
```

---

### Task 3: Extract the muted-text tones

`color: var(--text-3)` and `color: var(--text-2)`, alone or with a font size, account for ~40 instances. These are semantic — "this text is secondary" — and belong in a class.

**Files:**
- Modify: `apps/web/src/app/globals.css` (append)
- Modify: every `.tsx` under `apps/web/src` carrying those shapes
- Modify: `apps/agent/tests/test_inline_style_budget.py:24`

**Interfaces:**
- Consumes: `.surface` from Task 2 (not used here, but do not redefine it).
- Produces: CSS classes `.muted`, `.dim`, `.fine`, `.finer`. Later tasks may use them.

- [ ] **Step 1: Add the classes**

Append to `apps/web/src/app/globals.css`:

```css
/* ─────────────────────────────────────────────────── text tone and scale
   Named by ROLE, not by value. `.muted` is "supporting text", not
   "text-2" — so a palette change moves one declaration rather than every
   component that happened to pick the same token. */
.muted  { color: var(--text-2); }
.dim    { color: var(--text-3); }
.fine   { font-size: 0.875rem; }
.finer  { font-size: 0.8125rem; }
.finest { font-size: 0.75rem; }
```

- [ ] **Step 2: Find every instance**

```bash
cd /Users/sand224/sandscope/apps/web
grep -rn 'style={{ color: "var(--text-3)" }}' src --include='*.tsx'
grep -rn 'style={{ color: "var(--text-2)" }}' src --include='*.tsx'
grep -rn 'style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}' src --include='*.tsx'
grep -rn 'style={{ color: "var(--text-3)", fontSize: "0.75rem" }}' src --include='*.tsx'
```

- [ ] **Step 3: Replace each one**

Apply these substitutions. Where the element already has a `className`, append the new class inside the existing string rather than adding a second `className` attribute.

| Before | After |
|---|---|
| `style={{ color: "var(--text-3)" }}` | `className="dim"` |
| `style={{ color: "var(--text-2)" }}` | `className="muted"` |
| `style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}` | `className="dim finer"` |
| `style={{ color: "var(--text-3)", fontSize: "0.75rem" }}` | `className="dim finest"` |
| `className="mono" style={{ color: "var(--text-3)", fontSize: "0.75rem" }}` | `className="mono dim finest"` |

Do NOT touch any style object that also carries layout properties (`margin`, `padding`, `display`, `grid*`) — those come in Task 4. Only the pure colour/size shapes move here.

- [ ] **Step 4: Verify no visual change across all surfaces**

```bash
cd /Users/sand224/sandscope/apps/web
npm run typecheck
pkill -f "next start"; npm run build && (npm run start -- --port 3000 &) && sleep 6
npm run test:e2e
```

Expected: typecheck clean, 247 e2e passed.

- [ ] **Step 5: Lower the ratchet and commit**

```bash
cd /Users/sand224/sandscope
NEW=$(grep -rho 'style={{' apps/web/src --include='*.tsx' | wc -l | tr -d ' ')
sed -i '' "s/INLINE_STYLE_BUDGET = [0-9]*/INLINE_STYLE_BUDGET = $NEW/" apps/agent/tests/test_inline_style_budget.py
cd apps/agent && .venv/bin/python -m pytest tests/test_inline_style_budget.py -q
cd /Users/sand224/sandscope
git add -A
git commit -m "refactor(css): name the text tones instead of inlining tokens

.muted / .dim / .fine name the ROLE rather than the token, so a palette
change moves one declaration rather than every component that happened to
pick the same value.

Layout-carrying style objects deliberately untouched — those are Task 4."
```

---

### Task 4: Extract the per-component clusters, one file per commit

The remaining instances are component-specific layout. Do these ONE FILE AT A TIME, largest first, each as its own commit. A single commit touching nine files is unreviewable, which is how a refactor turns into an outage nobody can bisect.

Order: `Console.tsx` (50) → `delivery/page.tsx` (49) → `data/page.tsx` (48) → `reliability/page.tsx` (45) → `council/page.tsx` (41) → `Artifact.tsx` (40) → `Trace.tsx` (27) → `architecture/page.tsx` (25).

**Files:**
- Modify: one component per iteration, plus `apps/web/src/app/globals.css`
- Modify: `apps/agent/tests/test_inline_style_budget.py:24` each time

**Interfaces:**
- Consumes: `.surface`, `.muted`, `.dim`, `.fine`, `.finer`, `.finest`.
- Produces: per-component classes namespaced by component (`.console-*`, `.trace-*`). No new global utilities — if a shape repeats across components, it belonged in Task 2 or 3.

- [ ] **Step 1: Pick the next file and capture a before-screenshot**

```bash
cd /Users/sand224/sandscope/apps/web
FILE=src/components/Console.tsx   # then delivery, data, ... in the order above
pkill -f "next start"; npm run build && (npm run start -- --port 3000 &) && sleep 6
cat > /tmp/shot.mjs <<'EOF'
import { chromium } from '@playwright/test';
const [,, path, out] = process.argv;
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1200,height:1400}, colorScheme:'dark' })).newPage();
await p.goto('http://127.0.0.1:3000'+path, { waitUntil:'load' });
await p.waitForTimeout(400);
await p.screenshot({ path: out, fullPage: true });
await b.close();
EOF
node /tmp/shot.mjs /console /tmp/before.png
```

- [ ] **Step 2: Move each style object into a namespaced class**

For every `style={{...}}` in the file, add a class to `globals.css` under a comment naming the component, and replace the attribute. Example, from `Console.tsx`:

```css
/* ─────────────────────────────────────────────────────────────── console */
.console-run-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--s4);
  margin: 0;
}
```

```tsx
{/* before */}
<dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--s4)", margin: 0 }}>

{/* after */}
<dl className="console-run-grid">
```

Leave alone: any style object whose value is COMPUTED at render time (e.g. `style={{ left: pos(score) }}` in `EvidenceGate.tsx`, or `style={{ width: barWidth }}` in `Trace.tsx`). Those are data, not design, and moving them to CSS is impossible. Add a one-line comment above each explaining that, so the next reader does not try.

- [ ] **Step 3: Compare screenshots**

```bash
cd /Users/sand224/sandscope/apps/web
npm run typecheck
pkill -f "next start"; npm run build && (npm run start -- --port 3000 &) && sleep 6
node /tmp/shot.mjs /console /tmp/after.png
cmp /tmp/before.png /tmp/after.png && echo IDENTICAL || echo "PIXELS MOVED — diff the two files"
```

Expected: `IDENTICAL`. A full-page screenshot at fixed width is a real regression test here; trust it over reading the diff.

- [ ] **Step 4: Run the e2e suite**

```bash
cd /Users/sand224/sandscope/apps/web && npm run test:e2e
```

Expected: 247 passed.

- [ ] **Step 5: Lower the ratchet and commit — one file per commit**

```bash
cd /Users/sand224/sandscope
NEW=$(grep -rho 'style={{' apps/web/src --include='*.tsx' | wc -l | tr -d ' ')
sed -i '' "s/INLINE_STYLE_BUDGET = [0-9]*/INLINE_STYLE_BUDGET = $NEW/" apps/agent/tests/test_inline_style_budget.py
cd apps/agent && .venv/bin/python -m pytest tests/test_inline_style_budget.py -q
cd /Users/sand224/sandscope
git add -A
git commit -m "refactor(css): extract Console.tsx layout into named classes

Screenshot-compared full-page before and after: identical. Computed styles
(bar widths, marker positions) deliberately left inline and commented — they
are data, not design.

<OLD> -> <NEW> inline styles."
```

- [ ] **Step 6: Repeat Steps 1–5 for the next file in the order**

Do not batch. Each file is its own commit, its own screenshot comparison, its own ratchet decrement.

---

### Task 5: Wire the ratchet into CI

The test exists but nothing runs it on push until it is in a job.

**Files:**
- Modify: `.github/workflows/ci.yml` (the `agent` job)

**Interfaces:**
- Consumes: `apps/agent/tests/test_inline_style_budget.py` from Task 1.
- Produces: nothing.

- [ ] **Step 1: Confirm it already runs**

```bash
cd /Users/sand224/sandscope/apps/agent
.venv/bin/python -m pytest -q -m "not integration" 2>&1 | tail -2
```

The offline suite runs `pytest -q -m "not integration"`, which collects everything under `tests/`, so the new test is already covered. Verify by name:

```bash
.venv/bin/python -m pytest -q -m "not integration" --collect-only 2>&1 | grep -c inline_style_budget
```

Expected: `2` (both tests collected). If `0`, the file is not being collected — check it is directly under `tests/` and named `test_*.py`.

- [ ] **Step 2: Commit only if a change was needed**

If Step 1 showed the tests are collected, no workflow change is required and this task is complete — say so rather than inventing a commit.

---

## Self-Review

**Spec coverage:** The audit's finding was 395 inline styles across 18 files. Task 1 ratchets, Task 2 extracts the shared shell, Task 3 the shared text tones, Task 4 the per-component remainder file by file, Task 5 confirms CI coverage. Covered.

**Placeholder scan:** No TBDs. Every CSS block and TSX replacement is written out. Task 4 is deliberately iterative rather than enumerating all 8 files' classes — the pattern is shown in full with a real example from `Console.tsx`, and enumerating 300 class definitions in a plan would be less accurate than deriving them from the file in front of you.

**Type consistency:** `INLINE_STYLE_BUDGET` is the only cross-task identifier and is used identically in Tasks 1, 2, 3, 4. CSS class names (`.surface`, `.muted`, `.dim`, `.fine`, `.finer`, `.finest`) are defined in Tasks 2–3 and consumed in Task 4 under the same names.

**Known risk:** Task 4's screenshot comparison will show a false positive if the ambient video on a page renders a different frame between runs. If `cmp` fails on `/handover` or `/`, re-run with the video element hidden (`page.addStyleTag({content:'video{display:none}'})`) before concluding pixels moved.
