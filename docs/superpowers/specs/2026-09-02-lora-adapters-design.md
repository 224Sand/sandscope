# Design — four LoRA adapters over one base, replacing the semantic regexes

**Date:** 2026-09-02 · **Status:** Approved, not yet planned
**Relates to:** ADR-0009 (train offline, serve without the framework), ADR-0010
(labels true by construction), ADR-0013 (the classifier stays out of the live gate)

## Context

Every semantic decision in this system is a regular expression.

| decision | current implementation | what it structurally cannot do |
|---|---|---|
| does this question demand a quantity? | `_DEMANDS_A_VALUE` in `retrieval/evidence.py` | a demand phrased outside the listed nouns |
| does this passage supply one? | `_CONTAINS_A_VALUE` | "a fortnight", "two business days" |
| is this proposed action destructive? | `_DESTRUCTIVE`, `_IRREVERSIBLE` in `orchestrator/workloads.py` | "take node-3 out of the pool"; fires on "do **not** restart" |
| is this claim cited? | `uncited_claims` in `orchestrator/citations.py` | whether the cited chunk **supports** the claim |

This is not an oversight. It is the zero-LLM-at-request-time discipline, and it
has been paid for: the comment above `_CONTAINS_A_VALUE` records that its first
version was a plain `\d`, matched "Tier 0" and "Severity 1" everywhere, and so
"passed while catching nothing".

But negation, paraphrase and entailment are exactly what a regex cannot do and
what a small fine-tuned encoder does well — while preserving every property the
architecture requires: trained offline, served as ONNX, no framework at runtime,
no API call, deterministic, tens of milliseconds.

## Why LoRA specifically, and not full fine-tuning

Two reasons, both real at this scale:

1. **One base, four tasks.** All four decisions are sequence or sequence-pair
   classification. Full fine-tuning ships four ~140M models. LoRA ships one base
   and four adapters of roughly a megabyte each. This is LoRA's signature
   property rather than a retrofit of it.
2. **Capacity match.** Each task has hundreds to low thousands of constructed
   examples. Full fine-tuning of 140M parameters against 2,000 examples overfits,
   and this project has already been burned by exactly that: ADR-0013's operating
   point looked excellent on one pass and failed held-out folds at 6.1% against a
   5% budget. LoRA's low-rank constraint is the regulariser.

**What LoRA does not buy here, stated plainly:** the serving-side benefit. Each
adapter is merged into the base and exported to ONNX, so what ships is four
ordinary models, not a base plus swappable deltas. The saving is training-side.
That is a legitimate reason to use LoRA and it is a different reason from the one
most people assume, so it is written down rather than implied.

## Non-goals

- No generative model. Generation on the free container's CPU cannot meet the
  latency profile, and the provider chain already handles generation.
- No change to the provider chain, the router, or the semantic cache.
- No torch, transformers or peft in the serving image. ADR-0009 stands.
- Not a replacement for the evidence gate's thresholds. Those are derived from
  error budgets and are out of scope.

## Architecture

One base encoder, `microsoft/deberta-v3-small` (~142M), four LoRA adapters.

| adapter | graph node | replaces | task shape |
|---|---|---|---|
| **A1 claim-support** | `verify` | `uncited_claims` | (claim, chunk) → entailed / not |
| **A2 value-demand** | `assess_evidence` | `_DEMANDS_A_VALUE` | question → demands a quantity |
| **A3 destructive-intent** | `risk_gate` | `_DESTRUCTIVE`, `_IRREVERSIBLE` | proposal → destructive |
| **A4 instruction-smuggling** | input boundary | *nothing — T-15 is unguarded* | body → carries injected instructions |

A1 is the one that changes what the product can claim. `verify` currently checks
that a claim **has** a citation; it has never checked that the citation
**supports** it. That gap is the product's central promise.

## Labels — true by construction, no model, per ADR-0010

ADR-0010 forbids model-assigned labels: "ground truth that is itself a model's
opinion makes that claim unfalsifiable". Every label below is a property of how
the example was built.

**A1 claim-support.** Positive: a sentence extracted from chunk *C*, paired with
*C* — supported by construction. Hard negatives, both label-preserving by
construction:
  - the same sentence with a template negation applied (label flips)
  - the same sentence paired with the highest-ranked non-source chunk
Trivial lexical overlap is the failure mode here, so the negation arm is what
makes the task non-trivial.

**A2 value-demand.** The question generator already knows, per template, whether
a question asks for a quantity. The label is read from the **generator slot**,
never from `_DEMANDS_A_VALUE`. Labelling from the regex would teach the model the
regex and measure agreement rather than correctness.

**A3 destructive-intent.** Proposals are synthesized as
`{action} × {target tier} × {reversibility}`; the label is the **slot**, not the
surface string. The surface is then paraphrased without touching the slot, so the
regex breaks while the label holds. This is the adversarial arm and the reason
the task exists.

**A4 instruction-smuggling.** A known payload inserted into a benign body is a
positive by construction; the benign body alone is a negative.

## The distribution-shift problem, and its fix

A1 trains on sentences from the corpus but serves on sentences a **model** wrote.
Those are different distributions and a number from the first does not transfer
to the second.

The `citation` table stores `claim_text` and `chunk_id` for every completed run —
real model-written claims paired with the chunk actually cited. That is the
serving distribution, already recorded. A1's headline number is measured there,
on hand-adjudicated ground truth, and reported **separately** from the
constructed test set. The constructed number measures the task; the recorded
number measures the product.

## Evaluation protocol

- **Per-fold cross-validation.** The adapter is refitted inside each fold. An
  operating point chosen on the data it is scored against is a memory of that
  data (ADR-0013).
- **Two slices, never merged.** Each adapter is compared against the regex it
  replaces on (a) a random sample and (b) the adversarial slice. The adversarial
  slice is built to be hard for the regex, so merging the two would flatter the
  model. Reported side by side with the reason, the way `PENTEST_RESULTS.md`
  already separates what is and is not valid to compare.
- **Latency measured, not assumed.** p50 and p95 per adapter on the target
  container, against the existing 18.5ms re-ranker budget.

## Shipping rule

An adapter ships only if it beats its regex on the **random** slice under
cross-validation. Otherwise it stays out and gets an ADR saying why — the
ADR-0013 move, which is the more valuable artefact of the two.

**A3 is a safety exception and never replaces its regex.** It runs in union with
it: escalate if *either* fires. A model that misses a destructive action is
strictly worse than a regex that over-fires, and a classifier trained on a few
thousand constructed examples does not get sole charge of the approval gate.

## Serving

Train with `peft` (added to the `ml` extra only, beside torch and transformers) →
merge the adapter → export ONNX → serve with onnxruntime. The serving image gains
model files and no new dependency. A test asserts that the runtime closure still
imports neither torch nor peft, extending the existing ADR-0009 guard.

## Risks

- **The corpus is 87 chunks and synthetic.** Every number is a statement about
  this corpus. Said on the surface, not buried.
- **Four adapters is four chances to repeat D-001** — a test set too small and
  written by the implementer. The construction rule and per-fold CV are the
  defence, and the guard-of-the-guard discipline applies: each evaluation harness
  must be shown to fail on a deliberately broken adapter before its numbers are
  believed.
- **Latency may rule out the 142M base.** If p95 breaks the budget the base drops
  to MiniLM-L6 (22M) and the LoRA capacity argument weakens accordingly. That
  trade is measured and published rather than assumed either way.
- **A4 guards T-15 on synthetic attacks only.** Adversarial evaluation on
  self-authored attacks is weak evidence and will be labelled as such.

## Build order — this decomposes, it is not one plan

Four adapters, a training harness, a cross-validation harness, ONNX export and
the wiring into four graph nodes is too much for a single implementation plan.
It decomposes into four pieces, each shippable and each independently useful:

1. **Shared spine + A1 claim-support.** The LoRA training harness, the
   construction-rule dataset builder, the per-fold CV harness, the merge→ONNX
   export path, and the ADR-0009 runtime-closure guard — built once, proven by
   A1, which is the adapter that changes what the product can claim. Includes
   the evaluation against recorded `citation` rows.
2. **A3 destructive-intent.** Reuses the spine. Carries the union-with-regex
   safety rule and the paraphrase-adversarial dataset, which is the most
   interesting construction problem of the four.
3. **A2 value-demand.** Smallest. Closes a weakness the README already
   publishes, so it is the cleanest before/after story.
4. **A4 instruction-smuggling.** Last, because adversarial evaluation on
   self-authored attacks is the weakest evidence of the four and should not set
   the pattern for the others.

Each piece gets its own plan. Piece 1 carries most of the risk; if the spine
does not hold, pieces 2 to 4 are cheap to abandon and the finding is published
rather than the work being hidden.

## Traceability

One new requirement, FR-035 — "Semantic decisions are learned and measured
against the pattern-matching they replace, or explicitly kept out" — named
against the evaluation harness, per the existing matrix rule that a `Done` row
must name a test that exists.
