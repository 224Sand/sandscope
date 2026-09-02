"""Choose each arm's learning rate before comparing them.

A comparison in which one arm gets a rate suited to the other is not a
comparison. The first run of this used 2e-4 for both -- correct for LoRA, four
to ten times too high for full fine-tuning of 22.7M pretrained weights -- and
the full arm scored 0.867 on one fold then collapsed to predicting no positives
at all on the next (F1 exactly 0.000). Reporting that as "LoRA generalises
better" would have been a finding manufactured by a hyperparameter.

Selection happens on documents HELD OUT of cross-validation entirely. Picking a
rate on the same folds the arms are later scored on is the defect ADR-0013
records, one level up: the folds would carry a memory of the choice.

    .venv/bin/python -m training.sweep_entailment_lr

Run as a MODULE, not a path: `python training/x.py` puts training/ itself on
sys.path and the sibling import fails.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from transformers import AutoTokenizer

from sandscope_agent.evaluation.entailment_dataset import build_entailment_pairs
from training.train_entailment import (
    ARMS,
    BASE_MODEL,
    device,
    predict,
    reserved_documents,
    scores,
    train_one,
)

#: The split comes from train_entailment.reserved_documents, NOT from a copy of
#: the rule here. The first version of this file recomputed it locally, so
#: stratifying the reservation in train_entailment.py left this script still
#: taking the alphabetically-first four -- selecting the rate on a split that
#: the folds did not actually exclude. Two copies of one rule is how the media
#: budget ended up stated in three places and enforced in none.
#: Ordered high to low. A sweep whose winner sits at either end has not
#: bracketed the optimum -- it has only shown the direction to keep going --
#: so the report records whether the choice was interior and a boundary win is
#: treated as an unfinished search rather than a result.
CANDIDATES = {
    "lora": (1e-3, 5e-4, 2e-4, 5e-5),
    "full": (1e-4, 5e-5, 3e-5, 1e-5),
}
OUT = Path(__file__).resolve().parents[1] / "reports" / "entailment_lr_sweep.json"


def main(only: str | None = None, extra: tuple[float, ...] = ()) -> None:
    dev = device()
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    pairs = build_entailment_pairs()

    reserved = reserved_documents(pairs)
    inner = [p for p in pairs if p.document_id not in reserved]
    dev_set = [p for p in pairs if p.document_id in reserved]
    print(f"selection: train on {len(inner)} pairs, score on {len(dev_set)} from "
          f"{sorted(reserved)}", flush=True)

    # Merge with whatever a previous run already established, so extending one
    # arm's range does not discard the other arm's result.
    previous = json.loads(OUT.read_text()) if OUT.exists() else {}
    chosen: dict[str, float] = dict(previous.get("chosen", {}))
    record: dict[str, dict] = dict(previous.get("arms", {}))
    for arm in ARMS:
        if only and arm != only:
            continue
        results = {}
        rates = tuple(sorted(set(CANDIDATES[arm]) | set(extra), reverse=True))
        for rate in rates:
            model = train_one(inner, tokenizer, dev, arm, quiet=True, lr=rate)
            predicted = predict(model, tokenizer, dev_set, dev)
            truth = np.array([p.label for p in dev_set])
            s = scores(truth, predicted)
            results[rate] = s
            print(f"  [{arm}] lr {rate:g}: accuracy {s['accuracy']:.3f}  f1 {s['f1']:.3f}",
                  flush=True)
            del model
        best = max(results, key=lambda r: results[r]["f1"])
        chosen[arm] = best
        interior = best not in (max(rates), min(rates))
        record[arm] = {
            "candidates": {str(k): v for k, v in results.items()},
            "chosen": best,
            "interior": interior,
        }
        edge = "" if interior else "  <- AT THE EDGE OF THE RANGE, optimum not bracketed"
        print(f"  [{arm}] chosen {best:g}{edge}\n", flush=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "heldOutDocuments": sorted(reserved),
        "arms": record,
        "chosen": chosen,
        "note": (
            "Rates chosen on documents held out of cross-validation entirely, so the "
            "folds the arms are scored on have never seen them. Selecting on the scoring "
            "folds would put a memory of the choice into the number. `interior` is false "
            "when the winning rate sits at an end of the searched range, which means the "
            "optimum was not bracketed and the search is unfinished rather than decided."
        ),
    }, indent=2) + "\n")
    print(f"wrote {OUT}\n  {json.dumps(chosen)}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--arm", choices=ARMS, help="sweep only this arm")
    parser.add_argument(
        "--extra",
        type=float,
        nargs="*",
        default=[],
        help="additional rates, for extending a range whose winner sat at an edge",
    )
    args = parser.parse_args()
    main(only=args.arm, extra=tuple(args.extra))
