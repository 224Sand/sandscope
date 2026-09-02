"""Train the claim-support adapter (A1).

LoRA rather than full fine-tuning, for three reasons, all of them real at this
scale:

  1. One base serves four planned adapters. Full fine-tuning ships four ~142M
     models; LoRA ships one base and four adapters of about a megabyte.
  2. A thousand constructed examples against 142M parameters overfits. The
     low-rank constraint is the capacity match, and this project has been
     burned by exactly that failure once already (ADR-0013).
  3. It is what makes this trainable on the machine it is trained on. Full
     fine-tuning needs ~568MB of weights plus ~1.1GB of Adam state; LoRA
     trains a fraction of a percent of the parameters, so the optimiser state
     nearly vanishes and the run fits in 8GB alongside everything else.

Trained offline, merged, exported to ONNX and served without the framework
(ADR-0009). torch is ~1GB installed against ~50MB for onnxruntime.

    .venv/bin/python training/train_entailment.py
"""

from __future__ import annotations

import json
import random
import time
from pathlib import Path

import numpy as np
import torch
from peft import LoraConfig, get_peft_model
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from sandscope_agent.evaluation.entailment_dataset import EntailmentPair, build_entailment_pairs
from sandscope_agent.evaluation.folds import grouped_folds

#: 22.7M, not deberta-v3-small's 141.9M. The larger base was measured on this
#: machine and did not fit: sustained throughput was 17-19s/step against an
#: isolated probe's 1.69s, because 8GB of UNIFIED memory is shared with the OS
#: and the run swapped continuously (7.2GB of swap in use). Five folds would
#: have taken about ten hours with the laptop unusable throughout.
#:
#: The honest consequence is recorded rather than buried: at 22M, full
#: fine-tuning is entirely feasible -- 0.311s/step against LoRA's 0.273s at the
#: same 0.5GB peak -- so LoRA is no longer load-bearing for cost or memory.
#: Whether it earns its place on GENERALISATION, which is the only argument
#: left at this scale, is what the two arms below measure.
BASE_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
MODEL_DIR = Path(__file__).resolve().parents[1] / "sandscope_agent" / "orchestrator" / "entailment"
#: 288: the longest (claim, passage) pair under this tokenizer is 264 tokens,
#: so nothing truncates. Truncation is not a speed/accuracy trade here -- the
#: passage is what gets cut, the passage is where the supporting sentence
#: lives, and a positive whose support is cut away is still labelled
#: "supported". The saving would be bought with silently wrong labels.
MAX_LENGTH = 288
EPOCHS = 3
BATCH = 8
#: Per arm, because one rate cannot serve both and using one would rig the
#: comparison. LoRA trains small low-rank matrices and wants an aggressive
#: rate; full fine-tuning updates 22.7M pretrained weights and diverges at the
#: same value. The first run of this comparison used 2e-4 for both: the full
#: arm scored 0.867 on fold 1 and then collapsed to predicting no positives at
#: all on fold 2 (F1 exactly 0.000, accuracy 0.628 = the negative class share).
#: Reporting that as "LoRA generalises better" would have been a result
#: manufactured by an unfair hyperparameter.
LR = {"lora": 2e-4, "full": 3e-5}
FOLDS = 5

#: Base seed for weight initialisation and shuffling. Each fold uses SEED+n and
#: BOTH arms use the same value at the same fold, so the comparison is paired:
#: any difference between them comes from the method rather than from where
#: they happened to fall in the run order.
SEED = 20260902


def device() -> torch.device:
    # MPS on Apple silicon; CPU everywhere else. No CUDA on this machine.
    return torch.device("mps") if torch.backends.mps.is_available() else torch.device("cpu")


class PairDataset(Dataset):
    def __init__(self, pairs: list[EntailmentPair]) -> None:
        self.pairs = pairs

    def __len__(self) -> int:
        return len(self.pairs)

    def __getitem__(self, index: int) -> EntailmentPair:
        return self.pairs[index]


def collate(batch: list[EntailmentPair], tokenizer):
    encoded = tokenizer(
        [p.claim for p in batch],
        [p.chunk_body for p in batch],
        truncation=True,
        max_length=MAX_LENGTH,
        padding=True,
        return_tensors="pt",
    )
    encoded["labels"] = torch.tensor([p.label for p in batch], dtype=torch.long)
    return encoded


def build(arm: str):
    """One of the two arms. Same base, same data, same folds -- the only
    difference is whether the base weights are frozen."""
    base = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL, num_labels=2, ignore_mismatched_sizes=True
    )
    if arm == "full":
        return base
    config = LoraConfig(
        task_type="SEQ_CLS",
        r=8,
        lora_alpha=16,
        lora_dropout=0.1,
        # Verified against the loaded model's named_modules rather than
        # assumed: a LoraConfig matching nothing trains the classifier head
        # only and looks exactly like a successful run. This base is
        # BERT-family, so the names carry no `_proj` suffix.
        target_modules=["query", "key", "value"],
    )
    return get_peft_model(base, config)


def train_one(
    pairs: list[EntailmentPair],
    tokenizer,
    dev: torch.device,
    arm: str,
    quiet: bool = False,
    lr: float | None = None,
    seed: int = SEED,
):
    # Seed EVERY call. Without this, torch's global RNG advances with each model
    # trained, so a configuration's result depends on its position in the
    # sequence: the same rate scored 0.842 as the third config in one run and
    # 0.886 as the fifth in the next -- five times what was being reported as
    # seed noise. Worse, in the arm comparison LoRA trains before full, so the
    # second arm would systematically start from a different state and part of
    # any margin would be an artefact of the order they were run in.
    #
    # The seed is a function of the FOLD, not the arm or the rate, so both arms
    # see identical initialisation and identical shuffling at each fold. That
    # makes the comparison paired rather than merely averaged.
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if dev.type == "mps":
        torch.mps.manual_seed(seed)

    model = build(arm).to(dev)
    model.train()
    loader = DataLoader(
        PairDataset(pairs),
        batch_size=BATCH,
        shuffle=True,
        collate_fn=lambda b: collate(b, tokenizer),
    )
    optimiser = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=lr if lr is not None else LR[arm]
    )
    for epoch in range(EPOCHS):
        total = 0.0
        started = time.perf_counter()
        for step, batch in enumerate(loader, start=1):
            batch = {k: v.to(dev) for k, v in batch.items()}
            out = model(**batch)
            out.loss.backward()
            optimiser.step()
            optimiser.zero_grad()
            total += float(out.loss.detach())
            if not quiet and step % 25 == 0:
                rate = (time.perf_counter() - started) / step
                print(
                    f"      step {step}/{len(loader)}  {rate:.2f}s/step  "
                    f"eta {rate * (len(loader) - step):.0f}s",
                    flush=True,
                )
        if not quiet:
            print(f"    epoch {epoch + 1}  loss {total / max(len(loader), 1):.4f}", flush=True)
    return model


@torch.no_grad()
def predict(model, tokenizer, pairs: list[EntailmentPair], dev: torch.device) -> np.ndarray:
    model.eval()
    out: list[int] = []
    for start in range(0, len(pairs), BATCH):
        batch = pairs[start : start + BATCH]
        encoded = tokenizer(
            [p.claim for p in batch],
            [p.chunk_body for p in batch],
            truncation=True,
            max_length=MAX_LENGTH,
            padding=True,
            return_tensors="pt",
        ).to(dev)
        out.extend(model(**encoded).logits.argmax(dim=-1).cpu().tolist())
    return np.array(out)


def scores(truth: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    tp = int(((predicted == 1) & (truth == 1)).sum())
    fp = int(((predicted == 1) & (truth == 0)).sum())
    fn = int(((predicted == 0) & (truth == 1)).sum())
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "accuracy": float((predicted == truth).mean()),
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }


ARMS = ("lora", "full")

#: Documents reserved for choosing each arm's learning rate
#: (training/sweep_entailment_lr.py). They are excluded from the folds below,
#: so no number reported here has been influenced by the selection. 19
#: documents minus these leaves 15 for five folds.
HELD_OUT_DOCUMENTS = 4


def reserved_documents(pairs: list[EntailmentPair]) -> set[str]:
    """Documents held out for learning-rate selection, STRATIFIED by type.

    Taking the alphabetically-first four was systematically biased, because
    document ids carry their type as a prefix: it reserved both `arch`
    documents and left cross-validation with none of them. The reported number
    would have been an average over runbooks and policies for a model that then
    answers architecture questions.

    Reserved proportionally instead, rounding down, and never the last document
    of a type -- the corpus has only two architecture documents and neither can
    be spared from the folds. Selection is choosing one scalar, so a slightly
    unrepresentative selection set costs far less than an unrepresentative
    scoring set.
    """
    by_type: dict[str, list[str]] = {}
    for document in sorted({p.document_id for p in pairs}):
        by_type.setdefault(document.split("-")[0], []).append(document)

    total = sum(len(v) for v in by_type.values())
    exact = {k: len(v) * HELD_OUT_DOCUMENTS / total for k, v in by_type.items()}
    # Largest remainder. Flooring alone reserves one document of the four,
    # because every type but the largest rounds to zero -- and one document is
    # not a selection set.
    take = {k: int(v) for k, v in exact.items()}
    # Never strip a type below two documents: with one left it cannot appear in
    # more than a single fold. The corpus has exactly two architecture
    # documents, so neither is available.
    cap = {k: max(0, len(v) - 2) for k, v in by_type.items()}
    take = {k: min(v, cap[k]) for k, v in take.items()}
    for kind, _ in sorted(exact.items(), key=lambda kv: -(kv[1] % 1)):
        if sum(take.values()) >= HELD_OUT_DOCUMENTS:
            break
        if take[kind] < cap[kind]:
            take[kind] += 1

    reserved: set[str] = set()
    for kind, count in take.items():
        reserved.update(by_type[kind][:count])
    return reserved


def main() -> None:
    dev = device()
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    pairs = build_entailment_pairs()
    positives = sum(1 for p in pairs if p.label == 1)
    print(f"device {dev}", flush=True)
    print(f"{len(pairs)} pairs ({positives} supported, {len(pairs) - positives} not)", flush=True)

    # Both arms see identical folds. Refitting happens inside every fold: an
    # operating point chosen on the data it is scored against is a memory of
    # that data (ADR-0013).
    reserved = reserved_documents(pairs)
    scored = [p for p in pairs if p.document_id not in reserved]
    print(
        f"cross-validating on {len(scored)} pairs from "
        f"{len({p.document_id for p in scored})} documents; {len(reserved)} documents "
        f"reserved for learning-rate selection and excluded",
        flush=True,
    )
    folds = grouped_folds(scored, lambda p: p.document_id, k=FOLDS)
    results: dict[str, dict] = {}

    for arm in ARMS:
        per_fold: list[dict[str, float]] = []
        per_kind: dict[str, list[float]] = {}
        trainable = 0
        for number, (train_idx, test_idx) in enumerate(folds, start=1):
            print(f"[{arm}] fold {number}/{FOLDS}", flush=True)
            model = train_one(
                [scored[i] for i in train_idx], tokenizer, dev, arm, quiet=True, seed=SEED + number
            )
            trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
            held = [scored[i] for i in test_idx]
            predicted = predict(model, tokenizer, held, dev)
            truth = np.array([p.label for p in held])
            fold_scores = scores(truth, predicted)
            per_fold.append(fold_scores)
            print(
                f"    accuracy {fold_scores['accuracy']:.3f}  f1 {fold_scores['f1']:.3f}",
                flush=True,
            )
            for kind in {p.kind for p in held}:
                mask = np.array([p.kind == kind for p in held])
                per_kind.setdefault(kind, []).append(
                    float((predicted[mask] == truth[mask]).mean())
                )
            del model
        cv = {k: float(np.mean([f[k] for f in per_fold])) for k in per_fold[0]}
        # Standard error across folds. Without it a margin cannot be read: two
        # arms differing by less than the spread are indistinguishable, and
        # the honest verdict there is "inconclusive" rather than a winner.
        # Repeating one configuration across seeds moved F1 by about 0.006, so
        # anything at that scale is noise.
        se = {
            k: float(np.std([f[k] for f in per_fold], ddof=1) / np.sqrt(len(per_fold)))
            for k in per_fold[0]
        }
        results[arm] = {
            "cv": cv,
            "standardError": se,
            "perFold": per_fold,
            "perKind": {k: float(np.mean(v)) for k, v in per_kind.items()},
            "trainableParams": trainable,
        }
        print(f"[{arm}] cross-validated {json.dumps(cv)}", flush=True)

    # The arm that generalises better ships. At this scale LoRA costs nothing
    # to skip -- full fine-tuning is 14% slower at the same memory -- so the
    # only argument it has left is this number, and it either wins or it does
    # not.
    winner = max(ARMS, key=lambda a: results[a]["cv"]["f1"])
    loser = min(ARMS, key=lambda a: results[a]["cv"]["f1"])
    margin = results[winner]["cv"]["f1"] - results[loser]["cv"]["f1"]
    # A margin smaller than the combined spread of the two estimates is not a
    # result. Saying which arm "won" in that case would be reading noise.
    combined_se = float(
        np.hypot(results[winner]["standardError"]["f1"], results[loser]["standardError"]["f1"])
    )
    decisive = margin > combined_se
    verdict = "decisive" if decisive else "INCONCLUSIVE (margin within noise)"
    print(
        f"\nF1: {winner} {results[winner]['cv']['f1']:.4f} vs {loser} "
        f"{results[loser]['cv']['f1']:.4f}  margin {margin:.4f}  "
        f"combined SE {combined_se:.4f} -> {verdict}",
        flush=True,
    )

    print(f"fitting the shipping model with the {winner} arm on all folds", flush=True)
    final = train_one(pairs, tokenizer, dev, winner)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    # Saved MERGED either way, so the export path and the serving closure are
    # identical whichever arm won and neither needs peft to load it.
    plain = final.merge_and_unload() if winner == "lora" else final
    plain.save_pretrained(str(MODEL_DIR / "model"))
    tokenizer.save_pretrained(str(MODEL_DIR))
    (MODEL_DIR / "metrics.json").write_text(
        json.dumps(
            {
                "baseModel": BASE_MODEL,
                "pairs": len(pairs),
                "positives": positives,
                "folds": FOLDS,
                "cvPairs": len(scored),
                "heldOutForLrSelection": sorted(reserved),
                "maxLength": MAX_LENGTH,
                "learningRates": LR,
                "epochs": EPOCHS,
                "arms": results,
                "shipped": winner,
                "f1Margin": margin,
                "f1MarginCombinedSE": combined_se,
                "marginIsDecisive": decisive,
                "cvAccuracy": results[winner]["cv"]["accuracy"],
                "cvF1": results[winner]["cv"]["f1"],
                "cvPrecision": results[winner]["cv"]["precision"],
                "cvRecall": results[winner]["cv"]["recall"],
                "perKind": results[winner]["perKind"],
                "trainableParams": results[winner]["trainableParams"],
                "baseParams": sum(p.numel() for p in plain.parameters()),
            },
            indent=2,
        )
        + "\n"
    )
    for arm in ARMS:
        r = results[arm]
        print(
            f"  {arm:5} acc {r['cv']['accuracy']:.4f}  f1 {r['cv']['f1']:.4f}  "
            f"trainable {r['trainableParams']:,}",
            flush=True,
        )


if __name__ == "__main__":
    main()
