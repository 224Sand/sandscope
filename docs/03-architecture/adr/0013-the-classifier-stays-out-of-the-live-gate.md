# ADR-0013 — The trained classifier stays out of the live evidence gate

**Status:** Accepted · **Date:** 2026-08-29 · **Deciders:** Solutions Architect / FDE, QA Lead (FR-028, D-001)

## Context

Sprint 3 trained an evidence-sufficiency classifier: gradient boosting over 12
retrieval features, 715 labelled examples, cross-validated AUC 0.808 against a
0.609 baseline, exported to ONNX and served without scikit-learn (ADR-0009). It
has its own unit tests, its own ONNX-parity test, and a panel on `/reliability`.

It is not in the request path. `retrieval/evidence.py` decides with a
hand-derived three-band heuristic, and has since Sprint 2. A Sprint 9 audit
flagged this: three applied-ML requirements (FR-028 classifier, FR-029
re-ranker, FR-030 ANN benchmark) are each genuinely built and rigorously tested
as standalone artefacts, and none of the three is wired into what the API
actually serves. For a page whose entire argument is that its claims are
checkable, a component presented as production behaviour that no request ever
touches is the exact failure this project exists to avoid.

The obvious remedy is to wire it in. That was measured before it was done.

## Decision

**The classifier stays out of the live evidence gate.** The reliability surface
states plainly that it is an offline artefact rather than implying it serves
traffic.

The measurement is `training/evaluate_classifier_as_gate.py`, re-runnable, and
its result is the entire reason for this record.

## What was measured

All three configurations, over the same 715 labelled questions (396 answerable,
319 not):

| configuration | false answers | false refusals | deferred |
|---|---|---|---|
| heuristic alone (live today) | 4.7% | 2.3% | 87.3% |
| classifier alone, at its own threshold | 0.0% | **56.8%** | 0.0% |
| classifier adjudicating only AMBIGUOUS | 4.7% | **54.0%** | 0.0% |
| **budget** | **5%** | **10%** | |

As a hard gate the classifier over-refuses by more than five times its budget.
That is not a defect in the model: its threshold was calibrated against a 5%
FALSE-ANSWER budget, which is properly conservative for a probability and
catastrophic as a binary decision.

A two-sided band — answer above `hi`, refuse below `lo`, defer between —
looked considerably better. On a single pass over all 715, `lo=0.20, hi=0.50`
drove deferral from 87.3% down to **1.3%** with both error rates apparently
unchanged at 4.7% and 2.3%. That is a large, attractive, and publishable-looking
improvement to the weakness this project already publishes about itself.

It does not survive a held-out split. Choosing the band on four folds and
scoring it on the fifth:

| | held-out | budget |
|---|---|---|
| false answers | **6.1%** | 5% — **breached** |
| false refusals | 2.8% | 10% |
| deferred | 0.2% | |

and **2 of the 5 folds could find no band that met budget on their own training
portion at all**.

## Why this is recorded rather than quietly dropped

Selecting an operating point by sweeping the same rows it is then scored against
is **D-001 wearing different clothes**. D-001 was a 0% false-answer rate measured
on 22 questions against a real rate of 56.6% — obvious in hindsight because the
sample was tiny. This one is subtler: 715 questions is a real sample, the sweep
is a reasonable thing to do, and the improvement it reports is plausible in size
and direction. It would have shipped as a genuine result, and the published
false-answer rate would have been wrong in the direction that matters.

The one-line version, which is the transferable part: **an operating point
chosen on the data it is evaluated against is not a measurement, it is a
memory of that data.**

## Consequences

**Positive.** The published 4.7% false-answer rate continues to describe what
the service actually does. The reliability surface stops implying that a model
serves traffic when it does not. The measurement is committed and re-runnable,
so this decision can be overturned by evidence rather than by opinion.

**Negative.** The gate still defers 87.3% of questions to AMBIGUOUS, which is a
real weakness and remains published as one. The classifier remains built,
tested, and unused in production — that is honest, and it is still an asset
sitting idle.

**What would change this.** The model was fitted on all 715 questions, so it
leaks into every fold above; the folds remove only the larger and entirely
avoidable leak of selecting the band on its own evaluation data. A clean answer
needs the model refitted inside each fold, which needs the training extra
(~2GB, ADR-0009) that is deliberately absent from the serving image. Refitting
per fold, or labelling more questions, is the path to revisiting this — not a
better sweep.

**Verification.** `training/evaluate_classifier_as_gate.py` reproduces every
number here. `test_the_classifier_is_not_wired_into_the_live_gate` asserts the
decision holds, so the wiring cannot reappear silently in a later refactor.
