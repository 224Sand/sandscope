# Sprint 9 — Narrative & Craft

**Sprint goal:** Make the site land on someone who has never heard of it. Two audiences that
usually need different artefacts — an engineer judging whether the work is real, and a
non-technical reader judging whether the person is worth talking to — should both get what they
need from the same pages.

**Opened:** 2026-08-22 · **Release target:** 0.9.0 · **Gate:** Design Review + UAT

## Why this sprint exists

Sprints 6 and 7 built the proof surfaces and Sprint 8 put them online. The evidence is now
public, correct, and derived — and it is under-designed for the job it has to do.

Three findings from the Product Owner's review, all verified against the repository rather than
taken as impressions:

1. **There is no webfont.** `--sans` resolves through `-apple-system` and `SF Pro Text`, neither
   of which exists on Windows, where most readers are. The type scale that Sprint 6 set is
   invisible to the majority of viewers, who see a generic system fallback.
2. **There is no favicon.** No `icon`, no `favicon.ico`, no `apple-icon`. Every browser tab shows
   a blank glyph.
3. **The design language is minimal by an explicit decision** — `DESIGN_SYSTEM.md` says *"motion
   explains or it does not happen."* Correct for a proof surface whose argument is credibility.
   Insufficient for a landing surface whose job is to stop a scroll.

And one gap that is content, not craft: the project's own story — why it exists, who decided
what, what each role produced — lives in 21 governance documents nobody outside the repository
will open.

## Sprint backlog

| ID | Story | Pts | Acceptance |
|---|---|---|---|
| S9-TYPE | Three typographic voices, one per surface family | 5 | Self-hosted via `next/font`; no external request at runtime; no CLS |
| S9-MARK | A favicon that works at 16px | 3 | Present at every size browsers request; recognisable in a crowded tab bar |
| S9-MOTION | Scroll-driven motion system | 5 | Native `animation-timeline`; no animation library; reduced-motion honoured |
| S9-STORY | `/story` — the project explained to anyone | 13 | A non-technical reader can follow it end to end; every claim cites a real artefact |
| S9-ROLE | Role-perspective chooser inside `/story` | 8 | Viewer picks a role; that role's thread through the project resolves in place |
| S9-CONTEXT | Why it was built, what the scope is, what is missing | 3 | Stated on the surface, not only in the repository |
| S9-FIND | Every identifier the project cites is followable | 8 | An id is clickable wherever it sits; selecting any text offers the same lookup; the answer is one sentence lifted from the defining record, never authored twice; every occurrence listed in date order |

**Committed: 37 points.** Above the 28–34 of recent sprints, deliberately: S9-STORY and S9-ROLE
are one coherent piece of work and splitting them across a sprint boundary would ship half a
narrative.

## Typographic assignment

Three voices, assigned by what each surface is for. A single face across all of them would be
more conventional and less interesting; the risk being taken is that three is one more than most
sites can hold together, mitigated by keeping the navigation in one voice throughout so the
masthead never moves.

| Surface | Display / Body | Mono | Why |
|---|---|---|---|
| `/` | Geist | Geist Mono | Neutral and engineered. The product voice. |
| `/story` | Instrument Serif / Instrument Sans | — | Editorial. This surface is read, not scanned. |
| `/console` `/delivery` `/architecture` `/reliability` | Bricolage Grotesque | JetBrains Mono | Characterful at display sizes, dense and legible at data sizes. |

Commit Mono was the Product Owner's preference for the third pairing. It is not on Google Fonts
and self-hosting the file carries a licensing question this project should not hand-wave, so
JetBrains Mono (OFL, already named in the existing fallback stack) is substituted. Worth
revisiting if the licence is confirmed acceptable.

## Definition of Done additions

11. A typographic or motion claim is verified at two viewport widths and under
    `prefers-reduced-motion`, on a machine that does not have the fonts installed locally —
    otherwise the fallback path is the one nobody checks, which is exactly how S9-TYPE's finding
    went unnoticed for three sprints.

## Explicitly out of scope

The remaining Sprint 8 stories (S8-E2E, S8-THREAT, S8-OBS, S8-LOAD). They are unblocked now that
both halves are deployed, and they belong to Sprint 8's release gate rather than being absorbed
into this one — Sprint 7's retrospective already recorded pulling later-sprint work forward as
corrosive when it becomes a habit.

## Impediments

### IMP-11 — six font families is a real payload

Three pairings means up to six families. Mitigated by preferring variable fonts (one file across
a weight range), subsetting to latin, and loading only the weights actually used. If the measured
cost is disproportionate, the fix is to drop a voice, not to ship a slow page — the budget
discipline that governed the hero video (0.90MB against a 2.5MB ceiling) applies here too.
