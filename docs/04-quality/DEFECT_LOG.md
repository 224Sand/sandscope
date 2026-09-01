# Defect Log

**Owner:** QA Lead · **Opened:** 2026-08-20 (Sprint 5)

> Named as a QA Lead deliverable in the charter at Sprint 0 and **not created
> until Sprint 5**. Three defects had already been found, fixed and written up
> in postmortems without ever being logged as defects. Backfilled below rather
> than started clean, because a log that begins the day it is noticed hides the
> period it was missing.

| ID | Found | Sprint | Severity | Description | Root cause class | Status |
|---|---|---|---|---|---|---|
| D-001 | Sprint 3 | 2 | **1** | Refusal gate marked 150/265 unanswerable questions answerable — a 56.6% false-answer rate reported at the Sprint 2 gate as zero | Test set too small and too easy, written by the implementer | Fixed, guarded |
| D-002 | Sprint 3 | 3 | 2 | Evidence gate answered a value-demanding question the corpus never answers, scoring 8.85 | Similarity signals cannot distinguish "about this subject" from "answers this question" | Fixed, guarded |
| D-003 | Sprint 3 | 3 | 3 | Re-ranker experiment returned a null result that was two bugs: a NaN checkpoint and a saturated metric | NaN sorts as a no-op; document-level MRR was already 0.986 | Fixed, guarded |
| D-004 | Sprint 4 | 1 | 2 | Seed loader destroyed one embedding model's vectors when reloading under another | `chunk_embedding` cascades on chunk delete | Fixed, guarded |
| D-005 | Sprint 5 | 4 | 2 | Retry loop re-sent an identical prompt, so it could never succeed | Design oversight: the edge existed, the feedback did not | Fixed, guarded |
| D-006 | Sprint 5 | 4 | **1** | Semantic cache served the previous answer to a correction retry (0.886 similarity vs 0.60 threshold) | **Emergent interaction between two individually correct, individually measured components** | Fixed, guarded |
| D-007 | Sprint 5 | 4 | 2 | `RUN_BUDGET_USD=0` killed every run mid-stream with an unhandled error | Fail-fast not applied to configuration | Fixed, guarded |
| D-008 | Sprint 5 | 5 | 2 | CSP blocked React hydration in development; every button was inert HTML | A policy correct for production made development impossible | Fixed, guarded |
| D-009 | Sprint 5 | 5 | **1** | The console displayed assessments the governance layer had refused to emit | Rendering ignored the run outcome | Fixed, guarded |
| D-010 | Sprint 5 | 4 | **1** | Spend reservation priced against `providers[0]`, under-reserving 4x when failover reached a costlier provider | The guard assumed the cheapest candidate would serve | Fixed, guarded |
| D-011 | Sprint 6 | 6 | 3 | A comment inside a backslash continuation truncated the Semgrep invocation; the scan ran without its exclusion, printed success, and the shell exited 127 on the orphaned flag | Shell semantics: a comment ends a continuation. Every visible signal pointed elsewhere | Fixed, guarded |
| D-012 | Sprint 7 | 7 | 2 | No body-size limit on the run endpoint; a 200KB body reached the agent and returned 502 instead of being refused | Cost bounds were applied to spend and rate, but not to input length | Fixed, guarded |
| D-013 | Sprint 7 | 7 | **1** | The rate-limit pen test could not fail: it sent 8 requests against a limit of 20, and its pass condition accepted `all(c >= 400)`, so a service that was DOWN reported as correctly rate limited | A test written to pass rather than to detect | Fixed, guarded |
| D-014 | Sprint 7 | 7 | 2 | Traceability statuses drifted in both directions: 4 rows used statuses the legend never defined (`Done (design)`/`(gate)`/`(decision)`) which the delivery page counted as done, and 1 row sat at `Planned` while its test had passed for four sprints | A status column maintained by hand, rendered publicly as fact | Fixed, guarded |
| D-015 | Sprint 7 | 7 | 3 | The first README checker could not fail: it searched for each figure as a substring of the whole file, so changing `Commits \| 54` to 99 still passed because "54" appears in "54% of questions" | A guard written to confirm rather than to detect — caught only by deliberately corrupting a value | Fixed, guarded |
| D-016 | Sprint 7 | 7 | 2 | Sprints 6 and 7 were worked and shipped with no planning ceremony and no plan document; the sprint numbers existed only in defect-log entries, and a Sprint 5 retrospective commitment to raise exactly this was never honoured | Governance applied to the product but not to the process; the control relied on someone remembering | Fixed, guarded |
| D-017 | Sprint 8 | 8 | 2 | ADR-0003 placed the agent runtime on Hugging Face Docker Spaces "because it is free"; Docker Spaces are PRO-only, so three sprints of deployment work targeted a platform that cannot host it at $0 | A pricing claim recorded in an ADR without ever being read from the pricing page | Fixed, guarded |
| D-018 | Sprint 8 | 8 | **1** | CI never built the web application. A Dependabot PR taking Next 15→16 reported 10/10 green while the production build failed on all seven pages; no job had ever run `next build` | A pipeline whose green tick exercises none of the code under change | Fixed, guarded |
| D-019 | Sprint 8 | 8 | 2 | Two governance documents (PROJECT_RECORD.html, SPRINT_08_PLAN.md) asserted the web app was undeployed and Sprint 8 was blocked on credentials for a full week after the real deploy landed; caught only because the Product Owner quoted the stale text back and asked "true?" | The traceability guard catches a requirement claiming Done falsely (overclaiming); nothing caught a document claiming Blocked falsely once it resolved (underclaiming) | Fixed, guarded |
| D-020 | Sprint 9 | 9 | 2 | 20 of 45 `Planned` rows in the traceability matrix (BR-001/004/006/007/008/009/010, FR-002/005/006/007/010/014/015/016/020/025/026/027/029) had real, passing, CI-green tests months before the row was updated — a recurrence of D-014's exact root cause at 20x the scale, caught only by an explicit read-the-code-not-the-doc audit requested by the Product Owner ("I want all of the 45 to be done"). `PROJECT_RECORD.html` (the same document D-019 was found in) independently carried the same stale `13 done` / `45 Planned` figures in three places, hand-typed rather than generated | `check-traceability.mjs` (built for D-014) only fails the build in the overclaiming direction — a `Done` row with no matching test. It has never checked the reverse: a `Planned` row whose named-or-equivalent test already exists and passes, which the public delivery page then undercounts. `PROJECT_RECORD.html` is not generated from `delivery.json` at all, unlike the `/delivery` page and `README.md` — a third recurrence in the same file | Fixed (rows and HTML figures corrected); guard extension for the reverse direction, and generating PROJECT_RECORD.html's figures rather than typing them, are both open — see backlog |
| D-021 | Sprint 9 | 9 | **1** | Every scene on the landing page rendered at `opacity: 0` without JavaScript. `Scene` revealed itself with an `IntersectionObserver` and a `visible` state starting `false`, so the server-rendered markup carried an inline `opacity: 0` — measured with JS disabled, all 7 scenes computed to 0. The component's own docstring claimed "content is present in the DOM and legible with animation removed"; it was present and invisible. Reached production and sat there for four sprints | Motion implemented in JavaScript when the same reveal already existed in CSS (`.reveal`, scroll-driven, `@supports`- and `prefers-reduced-motion`-gated) on another page. A `next build` cannot see it, and there was no browser test that could | Fixed, guarded |
| D-022 | Sprint 9 | 9 | 3 | The public architecture diagram (`SystemMap.tsx`) labelled the runtime "hugging face space" for a week after ADR-0012 moved it to Northflank — the same stale-claim class as D-017 and D-019, on the surface a reviewer is most likely to read | An ADR superseded a platform decision; the prose documents were updated and an inline SVG label was not. `check-deploy-claims.mjs` (built for D-019) greps documents under `docs/`, not components under `apps/web/src` | Fixed; guard extension open — see backlog |

| D-023 | Sprint 9 | 9 | 2 | All 12 "read the decision" links on the public architecture surface pointed at the ADR *directory* rather than at a record: the href was built by concatenating a path ending `/adr/` with a filename the derived record never carried. Twelve dead links, each rendering as an ordinary underlined title. Found by the first e2e assertion that every decision link resolves to a `.md` | `derive-surfaces.mjs` omitted the ADR filename, and the page interpolated the missing field into a template literal — where `undefined` would have been visible but an absent property is simply empty string. Nothing checked that a rendered link had a destination | Fixed, guarded |
| D-024 | Sprint 9 | 9 | 2 | The memory panel rendered the session id, which is read from `sessionStorage` during render — `""` on the server, a real id in the browser. Every page carrying the console threw React #418 (hydration mismatch) in production. Reached `main`; caught by CI, on a build CI made itself | A client-only value became RENDERED output. It had been read during render since Sprint 5 and was harmless while nothing displayed it, so the bug was introduced by the component that finally showed it, not by the code that computed it | Fixed, guarded |
| D-025 | Sprint 9 | 9 | 2 | The local e2e suite reported green against a STALE build twice: Playwright's `reuseExistingServer: !process.env.CI` reused a server left running from an earlier build, so the run exercised the previous binary. It masked a fix that had not been rebuilt, then masked D-024 entirely — CI caught that one only because it builds from scratch | Playwright's documented default optimises for iteration speed and assumes the running server matches the working tree. For a suite whose whole purpose is to catch what `next build` cannot see, a local pass that does not exercise the current code is worse than no local run, because it is believed | Fixed |
| D-026 | Sprint 9 | 9 | 3 | Two labels on the public architecture diagram were struck through by the dashed lines they sat on. The masking plates were sized in SVG user units, so a width that covered the text on macOS was too short on Linux and at mobile scale — the fix for the first version broke on a platform the first version happened to pass on | A mask sized in absolute units cannot track text whose width depends on the font the platform resolved. Only reachable by rendering on more than one platform, which is what the mobile project and Linux CI now do | Fixed, guarded |
| D-027 | Sprint 9 | 9 | 2 | The public architecture diagram asserted three things about the system that were not true. The arrow pointing at **Upstash had no source node** — its tail began in empty space, because the only caller is the edge rate limiter and the node was drawn in the runtime's data column. The node was labelled **`redis · vector`**; Upstash Vector appears exactly once in the repository, in `training/benchmark_vector_store.py`, as the managed-store comparison arm for ADR-0011, and has never served a request. And an edge left the **Provider chain for Neon**, which never opens a database connection — nothing in `router.py` imports the db module. Reported by the Product Owner reading the deployed page | Same class as D-022 and D-019: a diagram is prose that nobody proofreads. The SVG is valid and renders without complaint, so a type check, a build and a screenshot all pass while it is wrong about the system. Nothing had ever asserted that an arrow starts and ends on a box | Fixed, guarded |
| D-028 | Sprint 9 | 9 | 3 | The role tabs on the story surface gave **no hover feedback at all once selected**: `.role-tab:hover` and `.role-tab[data-on="true"]` have identical specificity (0,2,0), so the later rule took back both `color` and `background` and the pointer sat over a control that showed no sign of being one. Selection was also carried by **colour alone** — `color`, `background` and `border-color`, every one of which a forced-colors mode overrides — so in Windows High Contrast the chosen role was indistinguishable from the other ten, and the page could not tell you whose story you were reading. The global `:focus-visible` additionally set `border-radius: 4px`, squaring off the 999px pill for keyboard users only. Reported by the Product Owner | An equal-specificity collision reads as a working rule in review; only the cascade order decides it, and nothing in the suite exercised hover-on-selected. The stylesheet carried no `forced-colors` block anywhere, so every `data-on` control on the site shared the second half of this | Fixed |
| D-029 | Sprint 9 | 9 | 2 | The label of a role tab was **unreadable for ~60ms every time it was selected**. `transition: color, background` interpolates the two independently, and the path from unselected (#a1a1a8 on #0b0b0d) to selected (#000 on #f5f5f7) runs the text toward black while the background is still near-black. Measured through the fade: contrast 7.66 → 5.39 → **1.71** → 8.62 → 19.29. Reported by the Product Owner as "the button does not display the text that is selected", with a screenshot that had caught the surface mid-fade | Every check anyone would think to run — reading the CSS, reading the cascade, measuring computed style — samples the SETTLED state, and the settled state was always correct at 19.29:1. The defect existed only in the transition between two individually-legible states, which nothing had ever sampled. Two earlier investigations in the same session concluded "renders correctly" for exactly this reason | Fixed, guarded |
| D-030 | Sprint 9 | 9 | 3 | The traceability matrix cites **26 sprint-story identifiers that no sprint plan ever defines** — S1-DATA, S1-FEED, S1-SEED, S2-CACHE, S2-CHAOS, S2-EVAL, S2-GOV, S2-GUARD, S2-RAG, S2-ROUTER, S2-SPEND, S3-CITE, S3-MEM, S3-RCA, S3-STREAM, S3-TRACE, S3-TRIAGE, S4-PERF, S4-UX, S5-ARCH, S5-DELIV, S6-DELIV, S6-REVIEW, S9-DATA, S9-GOV, S9-KT. Sprints 5 onward list their stories in a table; sprints 1-4 never did, so the matrix's story column points at records that do not exist. Three code comments also cite FR-036, FR-040 and FR-046, none of which appear in the matrix — they are the far ends of range shorthand (`FR-030..FR-036`) written without checking the range existed. Found within minutes of building the lexicon (FR-034), which is the argument for it | Same class as D-023's twelve links to a directory: a reference that renders as an ordinary reference and resolves to nothing. Nothing had ever checked that a cited identifier has a record, because until the lexicon existed nothing had ever enumerated the citations | Open — surfaced on /find as "no record defines it" rather than hidden; the sprint 1-4 plans are historical records and back-filling story tables into them would be rewriting history, so the honest fix is forward-only |

## Where these were found, which is the finding

| Found by | Count |
|---|---|
| Running the assembled system | **5** (D-005, D-006, D-007, D-008, D-009) |
| Measuring against a large labelled set | 2 (D-001, D-002) |
| CI against a real database | 1 (D-004) |
| Re-running a measurement after a change | 1 (D-003) |
| Reading a trace the product renders about itself | 1 (D-010) |
| CI reporting a failure whose visible cause was wrong | 1 (D-011) |
| Running the security suite against a live system | 2 (D-012, D-013) |
| Deriving a public number instead of trusting the document | 1 (D-014) |
| The Product Owner quoting stale text back and asking "true?" | 1 (D-019) |
| Deliberately breaking a guard to see whether it notices | 1 (D-015) |
| The Product Owner asking a direct question | **1** (D-016) |
| Reaching the deploy and finding the platform had changed | 1 (D-017) |
| Building a dependency PR by hand instead of trusting its checks | **1** (D-018) |
| An explicit "verify the doc against the code, not the other way round" audit | 1 (D-020) |
| **Standing up a test runner where there had never been one** | **3** (D-021, D-022, D-023) |
| The new e2e suite failing in CI on its own author's change | 1 (D-024) |
| Asking why a local pass and a CI failure disagreed | 1 (D-025) |
| Rendering the same page on a second platform | 1 (D-026) |
| **Code review** | **0** |
| **Unit tests written before the defect** | **0** |

Not one of these was caught by review or by the existing test suite. Every one
was caught by executing something — the system, a measurement, or a container.

D-006 is the one that could not have been caught any other way. Both components
had correct tests. The cache's test asks whether two different *questions*
collide (0.208, correctly no). Nobody asks whether a prompt collides with its
own *correction* (0.886, yes) until the two are wired together and run.

## Policy

A defect is logged here when found, before it is fixed, with its root cause
class.

A guard is not trusted until it has been run against the defect it claims to
catch and observed to fail. D-011 and D-015 were both found that way, and D-015
would otherwise have shipped as a check that could never fail -- inside the
script written to stop exactly that. A defect that reaches a deployed environment additionally gets a
postmortem in `docs/06-operations/postmortems/`.

## D-011 in detail — when every visible signal points the wrong way

**Found:** 2026-08-21, CI (Security workflow), after the fix for D-010's sibling failures.
**Severity:** Medium — the gate reported failure, but for a reason that pointed nowhere.

**What happened.** Excluding a Semgrep rule meant adding a `--exclude-rule` flag to a
backslash-continued `semgrep scan` invocation. The justification was written as comment
lines directly above the new flag, inside the continuation. Bash ends a continuation at a
comment, so the shell ran `semgrep scan` *without* the new flag, printed a complete and
entirely plausible scan report, and then tried to execute
`--exclude-rule=trailofbits...` as a program:

    line 21: --exclude-rule=trailofbits...: not found
    ##[error]Process completed with exit code 127

**Why it cost a round trip.** Every visible signal was misleading. Semgrep printed
`Scan completed successfully`, the finding it was supposed to suppress still appeared, and
the exit code (127) belongs to the shell, not to the scanner. The obvious reading — "the
exclusion flag doesn't work" — was wrong; the flag was never passed.

**Fix.** Moved all commentary above the invocation so the continued flags are contiguous.

**Guard.** `scripts/check-workflow-shell.mjs`, run in CI's governance job, parses every
`run:` block in `.github/workflows` and fails on (a) a comment line following a line ending
in `\`, and (b) any block that fails `bash -n`. It was verified against the broken file
before being trusted: it reports `security.yml:129`, the exact line that produced the 127.

**Class.** Same family as the silent no-op string replacements logged earlier: an edit that
appears to have applied, produces confident output, and changes nothing. The standing
response is unchanged — assert the anchor before writing, and prove the guard fails on the
bug it claims to catch.
