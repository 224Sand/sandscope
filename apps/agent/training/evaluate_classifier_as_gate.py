"""Would the trained classifier improve the LIVE evidence gate? (FR-028)

Run:  .venv/bin/python training/evaluate_classifier_as_gate.py

The classifier is trained, calibrated, ONNX-served and unit-tested, but it is
NOT in the request path: `retrieval/evidence.py` decides with a hand-derived
band. An audit flagged that gap, and the obvious fix -- wire it in -- turns out
to be wrong. This script is the measurement that establishes why, and exists so
the decision can be re-checked rather than believed.

Three configurations, all on the 715 labelled questions:

  heuristic alone (live today)   false answer  4.7%   false refuse  2.3%   defers 87.3%
  classifier alone, own threshold              0.0%                56.8%   defers  0.0%
  classifier adjudicating AMBIGUOUS            4.7%                54.0%   defers  0.0%

The classifier used as a hard gate over-refuses by five times its budget: its
threshold was calibrated for a 5% FALSE-ANSWER budget, which is properly
conservative for a probability and catastrophic as a binary decision.

A two-sided band -- answer above `hi`, refuse below `lo`, defer between --
looked much better on a single pass: deferral fell from 87.3% to 1.3% with both
error rates apparently unchanged. That result does not survive contact with a
held-out split, which is what this script actually measures. The band is chosen
on four folds and scored on the fifth:

  held-out false answers   6.1%  (budget 5%)   -- OVER
  held-out false refusals  2.8%  (budget 10%)
  and 2 of 5 folds could find no band meeting budget on their own training part

Choosing an operating point by sweeping the same rows it is then scored against
is D-001 in a new costume -- that defect was a 0% false-answer rate measured on
22 questions, against a real rate of 56.6%. The improvement here was smaller and
subtler, and would have shipped as a real one.

CAVEAT, stated because it bounds the result: the model itself was fitted on all
715 questions, so the MODEL still leaks into every fold. What the folds remove
is the larger and entirely avoidable leak of selecting the band on the same data
it is evaluated against. A clean answer needs the model refitted per fold, which
needs the training extra (~2GB, ADR-0009) and is why it is not done here.

Conclusion, recorded as ADR-0013: the classifier stays out of the live path.
"""

import random

from sandscope_agent.evaluation import classifier
from sandscope_agent.evaluation import features as feat
from sandscope_agent.evaluation.dataset import Label, build_dataset
from sandscope_agent.retrieval.corpus import chunk_corpus, load_corpus
from sandscope_agent.retrieval.embedding import HashingEmbedder
from sandscope_agent.retrieval.evidence import assess
from sandscope_agent.retrieval.hybrid import HybridRetriever

r = HybridRetriever(chunks=chunk_corpus(load_corpus()), embedder=HashingEmbedder())
r.build_vectors()
rows = []
for q in build_dataset().all:
    res = r.search(q.text, limit=6)
    rows.append(
        (
            q.label == Label.ANSWERABLE,
            assess(q.text, res).verdict.name,
            classifier.predict(feat.extract(q.text, res)).probability,
        )
    )


def rates(subset, lo, hi):
    fa = fr = df = na = nu = 0
    for is_ans, v, p in subset:
        if is_ans:
            na += 1
        else:
            nu += 1
        d = (
            "answer"
            if v == "SUFFICIENT"
            else "refuse"
            if v == "INSUFFICIENT"
            else ("answer" if p >= hi else "refuse" if p < lo else "defer")
        )
        if not is_ans and d == "answer":
            fa += 1
        if is_ans and d == "refuse":
            fr += 1
        if d == "defer":
            df += 1
    return fa / max(nu, 1), fr / max(na, 1), df / len(subset)


GRID = [
    (lo, hi)
    for lo in (0.02, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30)
    for hi in (0.40, 0.50, 0.60, 0.70, 0.85)
    if lo < hi
]
# Fixed seed so the fold assignment is reproducible: a result that moves
# between runs cannot be argued with. Not a security context.
random.Random(20260829).shuffle(rows)  # noqa: S311
folds = [rows[i::5] for i in range(5)]

print(f"{'fold':>5}{'chosen band':>16}{'held-out FA':>13}{'held-out FR':>13}{'defer':>9}")
agg = []
for i in range(5):
    test = folds[i]
    train = [r_ for j, f in enumerate(folds) if j != i for r_ in f]
    best = None
    for lo, hi in GRID:
        fa, fr, df = rates(train, lo, hi)
        if fa <= 0.05 and fr <= 0.10 and (best is None or df < best[0]):
            best = (df, lo, hi)
    if best is None:
        print(f"{i:>5}   no band met budget on train")
        continue
    _, lo, hi = best
    fa, fr, df = rates(test, lo, hi)
    agg.append((fa, fr, df))
    print(f"{i:>5}{f'[{lo:.2f}, {hi:.2f})':>16}{fa:>12.1%}{fr:>13.1%}{df:>9.1%}")

if agg:
    n = len(agg)
    print(
        f"\n{'mean over held-out folds':<21}{sum(a for a, _, _ in agg) / n:>12.1%}"
        f"{sum(b for _, b, _ in agg) / n:>13.1%}{sum(c for _, _, c in agg) / n:>9.1%}"
    )
    print(f"{'budget':<21}{'5.0%':>12}{'10.0%':>13}")
    print(f"{'heuristic alone':<21}{'4.7%':>12}{'2.3%':>13}{'87.3%':>9}")
