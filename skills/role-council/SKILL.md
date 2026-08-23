---
name: role-council
description: Assigns and enforces delivery roles for a piece of work — picks the methodology first (Scrum, Kanban, SAFe, Waterfall/stage-gate, CI/CD), derives the role set that methodology actually implies, then names a role before each substantive action and states what a decision requires. Also runs multi-role reviews over a git repository's real history, producing grounded, citation-backed commentary per role on real defects, decisions, commits or PRs — never invented opinions. Use whenever the user asks to work under named roles, wants role/duty/responsibility assignment for a session or project, mentions a methodology (agile, scrum, kanban, SAFe, waterfall, CI/CD) and who should do what, wants a cross-functional or "council" review of a PR/feature/decision/design, wants a project retrospective from multiple perspectives, or asks how different roles (dev/QA/PM/BA/TPM/security) would react to something. Works on any project — not tied to a fixed role list or one codebase.
---

# Role Council

Real delivery has roles because one person cannot hold every concern at once. A developer
optimising for elegance, a QA lead optimising for evidence, and a BA optimising for traceability
will reach different conclusions about the same artefact — and the disagreement is the value.

This skill does two related things:

- **Operating mode** — assign roles and work under them, naming a role before each substantive
  action and stopping where that role requires a decision.
- **Review mode** — replay real project history through those roles, producing grounded
  commentary on what actually happened.

Both start from the same place: the methodology.

## Step 1 — Establish the methodology, then the roles

**Do this first, and say it out loud.** The methodology determines who exists and what a decision
requires. Scrum has no Change Control Board. Waterfall has no retrospective. Kanban has no
sprint. A role set chosen before a methodology produces a committee that cannot decide anything.

Read `references/methodologies.md` for Scrum, Kanban, SAFe, Waterfall/stage-gate and CI/CD —
each with the roles it activates, what counts as a decision, and its characteristic failure mode.

If the project already declares a methodology and roles — a `WAYS_OF_WORKING.md`, a charter, a
CONTRIBUTING.md with a review process, CODEOWNERS — **adopt what it declares.** Proposing a
parallel structure that ignores a team's own governance is how this becomes theatre.

Otherwise infer it from the work: unpredictable arrival and no fixed cadence is Kanban; a fixed
scope with an expensive late change is stage-gate; multiple teams shipping one thing is SAFe.

Then state it in two sentences, naming the methodology, the active roles, and what a decision
requires. Add `references/role-archetypes.md` for the lens each individual role brings.

## Step 2 — Operating mode: work under the roles

For a session, a feature, or a whole project. The discipline is small and it is the entire point:

**Name the role before the action, not after.** `Role: QA Lead — verifying the fix against a
failing case first.` A role named afterwards is a label on work already done; named first, it
changes what you do next, because it tells you what you are optimising for.

**Stop where the methodology says a decision is made.** Not on every action — that is
unworkable — but on the ones the role set says belong to someone: scope, architecture, what
ships, accepting a story. Routine execution inside an already-approved decision continues without
a stop.

**A role may not sign off its own work.** If one agent or person is playing several roles, this
is the rule that stops it collapsing into a single voice agreeing with itself. QA signs off dev.
The architect signs off design conformance. The owner accepts scope.

**Classify inbound input by role too.** When the human says "the font looks wrong", that is a
Stakeholder observation; "don't ship until security passes" is a Release Authority instruction.
Naming which role the instruction came from tells you what authority it carries.

**When a role has produced nothing for a long stretch, say so.** A silent QA role is not a
passing QA role — that is exactly how a project ends up with a green pipeline that never ran the
code under change.

## Step 3 — Review mode: mine real artefacts

Never invent the disagreement. In priority order, look for:

1. A defect or issue log (`DEFECT_LOG.md`, `CHANGELOG.md`, tracker export)
2. Decision records (ADRs, `docs/decisions/`, RFCs)
3. Sprint or retro documents, postmortems
4. PR review threads (`gh pr view --json reviews,comments` where available)
5. Failing that: `git log --stat` for outsized diffs, reverts, and messages containing
   "fix" / "bug" / "broke" — real friction leaves traces even without a formal record

Every artefact reviewed needs a citation a reader can check: a defect ID, a commit SHA, a file
and line, a PR number. If a claim cannot be cited, it is not council material — drop it rather
than inventing texture.

## Step 4 — Get independent reactions, not a committee memo

The failure mode is one pass writing "the BA would probably think X, and QA would likely agree" —
groupthink with role labels stapled on.

**With subagents:** dispatch one per role against the same artefact, each blind to the others,
given only the artefact, its citation, and that role's brief. Collect, then assemble. Same
discipline `llm-council` uses between models, applied to delivery roles reviewing real work.

**Inline:** still write each role as a genuinely separate pass — finish and commit one role's
paragraph before starting the next. Drafting them together is where they start agreeing by
osmosis.

A role may have nothing to say about a given artefact. "Not something I'd weigh in on" from QA
about a database-region decision is more honest than an opinion stretched to fill a row.

## Step 5 — Assemble

Group by artefact, not by role — the reader wants one decision with every reaction beside it,
which is where disagreement becomes visible.

```markdown
## [Artefact title] — [citation: D-004 / commit a1b2c3d / PR #42]

**Methodology in force:** [what governed this decision at the time]
**What happened:** [one factual sentence, no opinion yet]

- **[Role]:** [reaction, grounded in that role's concern, referencing the artefact]
- **[Role]:** [reaction — say whether it agrees with or diverges from the above]

**Where they diverged:** [one line — if they genuinely didn't, say so rather than inventing
daylight between them]
```

Close with which roles agreed most (worth asking why — is one deferring to another?), which
artefact produced the sharpest disagreement, and what that reveals that a single-voice
retrospective would have missed.

## What makes this fail

- **Skipping step 1.** Roles without a methodology are a cast list, not a governance structure.
- **Naming the role after the work.** It becomes a label instead of a constraint.
- **Inventing an opinion with no basis.** Cite what exists or skip that role for that artefact.
- **Manufactured consensus.** If every role says "looks good", check the passes were actually
  independent rather than drafted together.
- **Manufactured conflict.** Equally fake. Find real friction in the artefacts; don't stage it.
- **A fixed role list.** Re-check step 1 if the roster looks identical across two very different
  projects.
- **Quietly dropping the discipline mid-session.** The most common failure by far. It decays when
  work gets urgent — which is precisely when the role that would have objected is the one being
  skipped.
