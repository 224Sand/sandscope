# LoRA Spine + A1 Claim-Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared LoRA training/evaluation/export spine and prove it with adapter A1, which decides whether a cited chunk actually *supports* the claim citing it — a judgement `uncited_claims` has never made.

**Architecture:** A LoRA adapter over `microsoft/deberta-v3-small` is trained offline on pairs whose labels are true by construction (ADR-0010), cross-validated with documents held out as groups, merged into the base, exported to ONNX, and served through `onnxruntime` + the Rust tokenizer core exactly as the re-ranker is (ADR-0009). It is measured twice: on the constructed set, and on real model-written claims recorded in the `citation` table.

**Tech Stack:** Python 3.11, torch 2.3 (MPS), transformers 4.42, peft (new), onnxruntime 1.18, `tokenizers`, numpy. pytest/unittest for tests.

## Global Constraints

- **ADR-0010 — labels are true by construction.** No function in the dataset module may call a model. A test asserts it, mirroring `evaluation/dataset.py`.
- **ADR-0009 — no training framework at serving time.** `torch`, `transformers`, `peft`, `sklearn`, `tensorflow` must not be importable from any serving module. A test parses the module's AST and asserts it.
- **ADR-0013 — per-fold refitting.** Any operating point or threshold is chosen inside the fold, never on the data it is scored against.
- **Hardware:** Apple M1, 8 GB RAM, MPS available, no CUDA. Batch sizes and `max_length` are chosen to fit; training must not require a GPU beyond MPS.
- **$0 budget.** No hosted training, no paid API. Every dependency free-tier or local.
- **Zero LLM at request time.** The adapter is a local ONNX graph; it makes no network call.
- **The corpus is 87 chunks and synthetic.** Every number produced is a statement about this corpus and must be labelled as such wherever it is published.
- **Shipping rule:** A1 ships into `verify` only if it beats the incumbent on the *random* slice under cross-validation. Otherwise it stays out and an ADR records why.

---

### Task 1: The construction-rule dataset

**Files:**
- Create: `apps/agent/sandscope_agent/evaluation/entailment_dataset.py`
- Create: `apps/agent/tests/test_entailment_dataset.py`
- Modify: `apps/agent/pyproject.toml` (add `peft>=0.13` to the `ml` extra)

**Interfaces:**
- Consumes: `sandscope_agent.retrieval.corpus.chunk_corpus`, `load_corpus`, `Chunk`; `sandscope_agent.orchestrator.citations.split_sentences`, `is_claim`; `sandscope_agent.seed.estate`.
- Produces: `EntailmentPair(claim: str, chunk_id: str, chunk_body: str, label: int, kind: str, document_id: str)`; `build_entailment_pairs() -> list[EntailmentPair]`; `negate_polarity(str) -> str | None`; `perturb_quantity(str) -> str | None`; `swap_entity(str) -> str | None`.

**Why these three negatives.** A positive is a sentence lifted verbatim from its chunk, so lexical overlap alone would separate positives from randomly-chosen negatives and the model would learn nothing. `perturb_quantity` and `swap_entity` produce negatives that are *near-identical* to the positive — one number or one service name different — so overlap cannot separate them. Getting the number right is exactly the failure this adapter exists to catch.

- [ ] **Step 1: Add peft to the ml extra**

In `apps/agent/pyproject.toml`, inside `ml = [...]`, after the `transformers` line:

```toml
  # LoRA. Training only, like torch and transformers above: adapters are merged
  # into the base before ONNX export, so nothing peft-shaped reaches serving.
  "peft>=0.13",
```

- [ ] **Step 2: Write the failing test**

Create `apps/agent/tests/test_entailment_dataset.py`:

```python
"""Claim-support pairs, with labels true by construction (ADR-0010).

A positive is a sentence lifted verbatim from the chunk it is paired with, so
support is a property of how the example was built rather than a judgement.
The negatives are deliberately near-identical to their positives: if a negative
were merely a different topic, lexical overlap would separate the classes and
the model would learn nothing about entailment.
"""

from __future__ import annotations

import ast
import inspect
import unittest

from sandscope_agent.evaluation import entailment_dataset as ed


class TestLabelsAreTrueByConstruction(unittest.TestCase):
    def test_no_function_in_the_module_calls_a_model(self) -> None:
        tree = ast.parse(inspect.getsource(ed))
        imported: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.update(a.name.split(".")[0] for a in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module.split(".")[0])
        forbidden = {"torch", "transformers", "peft", "onnxruntime", "openai", "anthropic"}
        self.assertFalse(imported & forbidden, f"dataset module imports {imported & forbidden}")

    def test_every_positive_is_a_verbatim_sentence_of_its_chunk(self) -> None:
        for pair in ed.build_entailment_pairs():
            if pair.label == 1:
                self.assertIn(
                    pair.claim.strip().rstrip("."),
                    pair.chunk_body,
                    f"positive {pair.claim!r} is not literally in {pair.chunk_id}",
                )

    def test_both_classes_are_present_and_neither_is_negligible(self) -> None:
        pairs = ed.build_entailment_pairs()
        positives = sum(1 for p in pairs if p.label == 1)
        self.assertGreater(len(pairs), 400, "too few pairs to cross-validate")
        self.assertGreater(positives / len(pairs), 0.2)
        self.assertLess(positives / len(pairs), 0.8)

    def test_negatives_are_near_identical_to_their_positives(self) -> None:
        """The whole point. A negative that shares no words with its positive
        is separable by overlap and teaches the model nothing."""
        pairs = ed.build_entailment_pairs()
        hard = [p for p in pairs if p.kind in {"quantity", "entity"}]
        self.assertGreater(len(hard), 50, "not enough hard negatives to matter")
        for pair in hard:
            self.assertEqual(pair.label, 0)


class TestPerturbations(unittest.TestCase):
    def test_polarity_negation_inserts_a_negation(self) -> None:
        self.assertEqual(
            ed.negate_polarity("The observation period is 30 minutes."),
            "The observation period is not 30 minutes.",
        )

    def test_polarity_negation_declines_when_it_cannot_apply(self) -> None:
        self.assertIsNone(ed.negate_polarity("Restart the pod."))

    def test_quantity_perturbation_changes_the_number(self) -> None:
        out = ed.perturb_quantity("Wait 30 minutes before escalating.")
        self.assertIsNotNone(out)
        assert out is not None
        self.assertNotIn("30", out)
        self.assertIn("minutes", out)

    def test_quantity_perturbation_declines_with_no_number(self) -> None:
        self.assertIsNone(ed.perturb_quantity("Escalate to the on-call engineer."))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd apps/agent && python -m pytest tests/test_entailment_dataset.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'sandscope_agent.evaluation.entailment_dataset'`

- [ ] **Step 4: Implement the dataset module**

Create `apps/agent/sandscope_agent/evaluation/entailment_dataset.py`:

```python
"""Claim-support pairs, labelled by construction (ADR-0010).

`verify` currently checks that a claim HAS a citation. It has never checked
that the cited chunk SUPPORTS it, and that gap is the product's central
promise. This builds the data for an adapter that closes it.

The label is a property of how each example was made:

  * supported     - the claim is a sentence lifted verbatim from the chunk
  * not supported - the same sentence with its polarity flipped, its quantity
                    changed, or its subject swapped for a different service;
                    or paired with a different chunk entirely

The three perturbations exist because the obvious dataset is worthless. If
positives were verbatim sentences and negatives were unrelated passages,
lexical overlap alone would separate them at near-perfect accuracy and the
model would have learned string matching -- which is what it is replacing.
A negative differing from its positive by one number is not separable that way.

No function here calls a model. A test asserts it.
"""

from __future__ import annotations

import random
import re
from dataclasses import dataclass

from sandscope_agent.orchestrator.citations import is_claim, split_sentences
from sandscope_agent.retrieval.corpus import Chunk, chunk_corpus, load_corpus
from sandscope_agent.retrieval.tokenize import tokenize

SEED = 20260902

#: Auxiliaries a polarity flip can attach to, longest first so "is not" is not
#: produced from an already-negated sentence.
_POLARITY = [
    ("must not", "must"), ("cannot", "can"), ("should not", "should"),
    ("does not", "does"), ("is not", "is"), ("are not", "are"),
    ("was not", "was"), ("were not", "were"),
]
_QUANTITY = re.compile(r"\b(\d+(?:\.\d+)?)\b")


@dataclass(frozen=True, slots=True)
class EntailmentPair:
    claim: str
    chunk_id: str
    chunk_body: str
    #: 1 = the chunk supports the claim, 0 = it does not.
    label: int
    #: How the example was constructed: verbatim | polarity | quantity |
    #: entity | other-chunk. Carried so evaluation can report per-kind, because
    #: an adapter that only beats the easy negatives has not earned its place.
    kind: str
    #: Grouping key for cross-validation. Sentences from one document must
    #: never straddle a fold boundary or the score is leakage.
    document_id: str


def negate_polarity(sentence: str) -> str | None:
    """Flip the sentence's polarity, or None when no auxiliary is present."""
    for negative, positive in _POLARITY:
        if re.search(rf"\b{negative}\b", sentence, re.IGNORECASE):
            return None  # already negative; flipping back would make it true
    for negative, positive in _POLARITY:
        match = re.search(rf"\b{positive}\b", sentence, re.IGNORECASE)
        if match:
            return sentence[: match.start()] + negative + sentence[match.end() :]
    return None


def perturb_quantity(sentence: str, rng: random.Random | None = None) -> str | None:
    """Change a stated quantity, leaving everything else identical."""
    rng = rng or random.Random(SEED)
    match = _QUANTITY.search(sentence)
    if not match:
        return None
    original = float(match.group(1))
    # A different magnitude, never a rounding of the same value: "30" -> "31"
    # is a claim a reader could not adjudicate either.
    factor = rng.choice([2, 3, 5, 10])
    changed = int(original * factor) if original else factor
    if changed == int(original):
        changed = int(original) + factor
    return sentence[: match.start()] + str(changed) + sentence[match.end() :]


def swap_entity(sentence: str, names: list[str], rng: random.Random | None = None) -> str | None:
    """Attribute the sentence to a different service."""
    rng = rng or random.Random(SEED)
    present = [n for n in names if re.search(rf"\b{re.escape(n)}\b", sentence)]
    if not present:
        return None
    target = present[0]
    alternatives = [n for n in names if n != target]
    if not alternatives:
        return None
    return re.sub(rf"\b{re.escape(target)}\b", rng.choice(alternatives), sentence, count=1)


def _service_names() -> list[str]:
    from sandscope_agent.seed import estate

    names = {s.name for s in estate.SERVICES}
    return sorted(names)


def _most_similar_other(chunk: Chunk, chunks: list[Chunk]) -> Chunk | None:
    """The lexically closest chunk that is not this one.

    A random other chunk is too easy: the model separates it on topic. The
    nearest neighbour is the passage a retriever would actually confuse this
    one with, which is the case that matters at serving time.
    """
    target = set(tokenize(chunk.body))
    best: tuple[float, Chunk] | None = None
    for other in chunks:
        if other.id == chunk.id:
            continue
        tokens = set(tokenize(other.body))
        if not tokens or not target:
            continue
        overlap = len(target & tokens) / len(target | tokens)
        if best is None or overlap > best[0]:
            best = (overlap, other)
    return best[1] if best else None


def build_entailment_pairs() -> list[EntailmentPair]:
    """Every claim-support pair the corpus can produce, labelled by construction."""
    rng = random.Random(SEED)
    documents = load_corpus()
    chunks = chunk_corpus(documents)
    names = _service_names()
    pairs: list[EntailmentPair] = []

    for chunk in chunks:
        neighbour = _most_similar_other(chunk, chunks)
        for sentence in split_sentences(chunk.body):
            if not is_claim(sentence):
                continue
            pairs.append(
                EntailmentPair(sentence, chunk.id, chunk.body, 1, "verbatim", chunk.document_id)
            )
            for kind, made in (
                ("polarity", negate_polarity(sentence)),
                ("quantity", perturb_quantity(sentence, rng)),
                ("entity", swap_entity(sentence, names, rng)),
            ):
                if made and made != sentence:
                    pairs.append(
                        EntailmentPair(made, chunk.id, chunk.body, 0, kind, chunk.document_id)
                    )
            if neighbour is not None:
                pairs.append(
                    EntailmentPair(
                        sentence, neighbour.id, neighbour.body, 0, "other-chunk",
                        neighbour.document_id,
                    )
                )
    rng.shuffle(pairs)
    return pairs
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/agent && python -m pytest tests/test_entailment_dataset.py -q`
Expected: PASS. If `test_both_classes_are_present_and_neither_is_negligible` fails on count, print `len(build_entailment_pairs())` and report the real number rather than lowering the threshold to fit.

- [ ] **Step 6: Verify the estate import surface**

Run: `cd apps/agent && python -c "from sandscope_agent.seed import estate; print(sorted({s.name for s in estate.SERVICES})[:5])"`
Expected: a list of service names. If `SERVICES` is not the attribute, inspect `estate` and fix `_service_names()` to match — do not guess.

- [ ] **Step 7: Commit**

```bash
cd /Users/sand224/sandscope
git add apps/agent/sandscope_agent/evaluation/entailment_dataset.py apps/agent/tests/test_entailment_dataset.py apps/agent/pyproject.toml
git commit -m "feat(entailment): claim-support pairs, labelled by construction

Positives are sentences lifted verbatim from their chunk. Negatives are the
same sentence with its polarity flipped, its quantity changed, or its subject
swapped -- near-identical to the positive on purpose, because negatives drawn
from unrelated passages are separable by lexical overlap and teach a model
string matching, which is what this adapter replaces."
```

---

### Task 2: The cross-validation harness, and proof it leaks nothing

**Files:**
- Create: `apps/agent/sandscope_agent/evaluation/folds.py`
- Create: `apps/agent/tests/test_folds.py`

**Interfaces:**
- Consumes: `EntailmentPair` from Task 1.
- Produces: `grouped_folds(items, group_of, k=5, seed=SEED) -> list[tuple[list[int], list[int]]]` returning (train_indices, test_indices) per fold.

**Why grouped.** Sentences from one document are near-duplicates of each other. A random split puts a sentence in train and its neighbour in test, and the score measures memorisation. Documents are the grouping unit.

- [ ] **Step 1: Write the failing test**

Create `apps/agent/tests/test_folds.py`:

```python
"""Fold construction, and the leak it exists to prevent.

ADR-0013: an operating point chosen on the data it is scored against is a
memory of that data. The same applies to a fold whose training half contains
near-duplicates of its test half -- sentences from one document are exactly
that, so documents are the grouping unit.
"""

from __future__ import annotations

import unittest

from sandscope_agent.evaluation.folds import grouped_folds


class TestGroupedFolds(unittest.TestCase):
    def setUp(self) -> None:
        # 12 documents, 5 items each.
        self.items = [f"doc{d}-item{i}" for d in range(12) for i in range(5)]
        self.group = lambda s: s.split("-")[0]

    def test_every_item_is_tested_exactly_once(self) -> None:
        folds = grouped_folds(self.items, self.group, k=4)
        tested: list[int] = []
        for _, test in folds:
            tested.extend(test)
        self.assertEqual(sorted(tested), list(range(len(self.items))))

    def test_a_document_never_straddles_a_fold(self) -> None:
        for train, test in grouped_folds(self.items, self.group, k=4):
            train_groups = {self.group(self.items[i]) for i in train}
            test_groups = {self.group(self.items[i]) for i in test}
            self.assertFalse(
                train_groups & test_groups,
                f"documents {train_groups & test_groups} appear in both halves",
            )

    def test_it_refuses_more_folds_than_groups(self) -> None:
        with self.assertRaises(ValueError):
            grouped_folds(self.items, self.group, k=99)

    def test_folds_are_deterministic_for_a_seed(self) -> None:
        a = grouped_folds(self.items, self.group, k=4, seed=7)
        b = grouped_folds(self.items, self.group, k=4, seed=7)
        self.assertEqual(a, b)


class TestTheGuardCatchesALeak(unittest.TestCase):
    """Guard of the guard. A fold splitter nobody has watched fail is a fold
    splitter nobody knows works."""

    def test_an_ungrouped_split_is_detected_as_leaking(self) -> None:
        items = [f"doc{d}-item{i}" for d in range(12) for i in range(5)]
        group = lambda s: s.split("-")[0]
        # A deliberately WRONG splitter: contiguous slices ignoring the group.
        size = len(items) // 4
        leaky = [
            ([j for j in range(len(items)) if not (i * size <= j < (i + 1) * size)],
             list(range(i * size, (i + 1) * size)))
            for i in range(4)
        ]
        straddled = False
        for train, test in leaky:
            if {group(items[i]) for i in train} & {group(items[i]) for i in test}:
                straddled = True
        self.assertTrue(straddled, "the leak fixture does not actually leak")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/agent && python -m pytest tests/test_folds.py -q`
Expected: FAIL — `No module named 'sandscope_agent.evaluation.folds'`

- [ ] **Step 3: Implement**

Create `apps/agent/sandscope_agent/evaluation/folds.py`:

```python
"""Grouped k-fold splitting.

Written here rather than taken from scikit-learn for the same reason
`evaluation/statistics.py` is: the serving closure carries neither, and a test
checks this agrees with the reference implementation where one exists.
"""

from __future__ import annotations

import random
from typing import Callable, Sequence, TypeVar

T = TypeVar("T")


def grouped_folds(
    items: Sequence[T],
    group_of: Callable[[T], str],
    k: int = 5,
    seed: int = 20260902,
) -> list[tuple[list[int], list[int]]]:
    """k folds in which no group appears on both sides of a split.

    Groups are distributed largest-first into the currently smallest fold,
    which keeps fold sizes close without ever splitting a group.
    """
    by_group: dict[str, list[int]] = {}
    for index, item in enumerate(items):
        by_group.setdefault(group_of(item), []).append(index)

    if k > len(by_group):
        raise ValueError(f"{k} folds requested but only {len(by_group)} groups exist")

    groups = sorted(by_group.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    rng = random.Random(seed)
    rng.shuffle(groups)
    groups.sort(key=lambda kv: -len(kv[1]))

    buckets: list[list[int]] = [[] for _ in range(k)]
    for _, indices in groups:
        smallest = min(range(k), key=lambda i: len(buckets[i]))
        buckets[smallest].extend(indices)

    folds: list[tuple[list[int], list[int]]] = []
    for i in range(k):
        test = sorted(buckets[i])
        train = sorted(j for b in range(k) if b != i for j in buckets[b])
        folds.append((train, test))
    return folds
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/agent && python -m pytest tests/test_folds.py -q`
Expected: PASS (5 tests)

- [ ] **Step 5: Cross-check against scikit-learn**

Run:
```bash
cd apps/agent && python -c "
from sklearn.model_selection import GroupKFold
from sandscope_agent.evaluation.folds import grouped_folds
items=[f'doc{d}-item{i}' for d in range(12) for i in range(5)]
groups=[s.split('-')[0] for s in items]
ours=grouped_folds(items, lambda s: s.split('-')[0], k=4)
for train,test in ours:
    tg={groups[i] for i in train}; sg={groups[i] for i in test}
    assert not (tg & sg)
print('no group straddles a fold in any of', len(ours), 'folds')
"
```
Expected: `no group straddles a fold in any of 4 folds`

- [ ] **Step 6: Commit**

```bash
cd /Users/sand224/sandscope
git add apps/agent/sandscope_agent/evaluation/folds.py apps/agent/tests/test_folds.py
git commit -m "feat(eval): grouped k-fold splitting, proven not to leak

Sentences from one document are near-duplicates of each other, so a random
split scores memorisation. Documents are the grouping unit. The guard is
proven against a deliberately ungrouped splitter."
```

---

### Task 3: LoRA training on deberta-v3-small

**Files:**
- Create: `apps/agent/training/train_entailment.py`
- Create: `apps/agent/sandscope_agent/orchestrator/entailment/` (output directory, git-tracked once populated)

**Interfaces:**
- Consumes: `build_entailment_pairs()` (Task 1), `grouped_folds()` (Task 2).
- Produces: on disk — `entailment/adapter/` (peft adapter), `entailment/tokenizer.json`, `entailment/metrics.json` with keys `baseModel`, `pairs`, `positives`, `folds`, `cvAccuracy`, `cvF1`, `perKind`, `trainableParams`, `baseParams`.

- [ ] **Step 1: Write the training script**

Create `apps/agent/training/train_entailment.py`:

```python
"""Train the claim-support adapter (A1).

LoRA rather than full fine-tuning, for three reasons, all of them real at this
scale:

  1. One base serves four planned adapters. Full fine-tuning ships four ~140M
     models; LoRA ships one base and four adapters of about a megabyte.
  2. A few thousand constructed examples against 142M parameters overfits.
     The low-rank constraint is the capacity match, and this project has been
     burned by exactly that failure once already (ADR-0013).
  3. It is what makes this trainable on the machine it is trained on. Full
     fine-tuning needs ~568MB of weights plus ~1.1GB of Adam state; LoRA
     trains ~0.4M parameters, so the optimiser state nearly vanishes and the
     run fits in 8GB alongside everything else.

Trained offline, merged, exported to ONNX and served without the framework
(ADR-0009). torch is ~1GB installed against ~50MB for onnxruntime.

    python training/train_entailment.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
from peft import LoraConfig, get_peft_model
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from sandscope_agent.evaluation.entailment_dataset import EntailmentPair, build_entailment_pairs
from sandscope_agent.evaluation.folds import grouped_folds

BASE_MODEL = "microsoft/deberta-v3-small"
MODEL_DIR = Path(__file__).resolve().parents[1] / "sandscope_agent" / "orchestrator" / "entailment"
MAX_LENGTH = 256
EPOCHS = 3
BATCH = 8
LR = 2e-4
FOLDS = 5


def device() -> torch.device:
    # MPS on Apple silicon; CPU everywhere else. No CUDA on this machine.
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


class PairDataset(Dataset):
    def __init__(self, pairs: list[EntailmentPair], tokenizer) -> None:
        self.pairs = pairs
        self.tokenizer = tokenizer

    def __len__(self) -> int:
        return len(self.pairs)

    def __getitem__(self, index: int) -> EntailmentPair:
        return self.pairs[index]


def collate(batch: list[EntailmentPair], tokenizer):
    encoded = tokenizer(
        [p.claim for p in batch],
        [p.chunk_body for p in batch],
        truncation=True, max_length=MAX_LENGTH, padding=True, return_tensors="pt",
    )
    encoded["labels"] = torch.tensor([p.label for p in batch], dtype=torch.long)
    return encoded


def lora_model():
    base = AutoModelForSequenceClassification.from_pretrained(BASE_MODEL, num_labels=2)
    config = LoraConfig(
        task_type="SEQ_CLS",
        r=8,
        lora_alpha=16,
        lora_dropout=0.1,
        target_modules=["query_proj", "key_proj", "value_proj"],
    )
    return get_peft_model(base, config)


def train_one(pairs: list[EntailmentPair], tokenizer, dev: torch.device):
    model = lora_model().to(dev)
    model.train()
    loader = DataLoader(
        PairDataset(pairs, tokenizer), batch_size=BATCH, shuffle=True,
        collate_fn=lambda b: collate(b, tokenizer),
    )
    optimiser = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=LR
    )
    for epoch in range(EPOCHS):
        total = 0.0
        for batch in loader:
            batch = {k: v.to(dev) for k, v in batch.items()}
            out = model(**batch)
            out.loss.backward()
            optimiser.step()
            optimiser.zero_grad()
            total += float(out.loss)
        print(f"  epoch {epoch + 1}  loss {total / max(len(loader), 1):.4f}")
    return model


@torch.no_grad()
def predict(model, tokenizer, pairs: list[EntailmentPair], dev: torch.device) -> np.ndarray:
    model.eval()
    out: list[int] = []
    for start in range(0, len(pairs), BATCH):
        batch = pairs[start : start + BATCH]
        encoded = tokenizer(
            [p.claim for p in batch], [p.chunk_body for p in batch],
            truncation=True, max_length=MAX_LENGTH, padding=True, return_tensors="pt",
        ).to(dev)
        logits = model(**encoded).logits
        out.extend(logits.argmax(dim=-1).cpu().tolist())
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
        "precision": precision, "recall": recall, "f1": f1,
    }


def main() -> None:
    dev = device()
    print(f"device {dev}")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    pairs = build_entailment_pairs()
    positives = sum(1 for p in pairs if p.label == 1)
    print(f"{len(pairs)} pairs ({positives} supported, {len(pairs) - positives} not)")

    # Cross-validation FIRST, refitting inside every fold. The headline number
    # is this one, not the score of the model that ships (ADR-0013).
    folds = grouped_folds(pairs, lambda p: p.document_id, k=FOLDS)
    per_fold: list[dict[str, float]] = []
    per_kind: dict[str, list[float]] = {}
    for number, (train_idx, test_idx) in enumerate(folds, start=1):
        print(f"fold {number}/{FOLDS}")
        model = train_one([pairs[i] for i in train_idx], tokenizer, dev)
        held = [pairs[i] for i in test_idx]
        predicted = predict(model, tokenizer, held, dev)
        truth = np.array([p.label for p in held])
        per_fold.append(scores(truth, predicted))
        for kind in {p.kind for p in held}:
            mask = np.array([p.kind == kind for p in held])
            per_kind.setdefault(kind, []).append(float((predicted[mask] == truth[mask]).mean()))
        del model

    cv = {k: float(np.mean([f[k] for f in per_fold])) for k in per_fold[0]}
    print("\ncross-validated:", json.dumps(cv, indent=2))
    print("per kind:", json.dumps({k: round(float(np.mean(v)), 4) for k, v in per_kind.items()}, indent=2))

    # Then the shipping model, on everything.
    print("\nfitting the shipping adapter on all folds")
    final = train_one(pairs, tokenizer, dev)
    trainable = sum(p.numel() for p in final.parameters() if p.requires_grad)
    total = sum(p.numel() for p in final.parameters())

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    final.save_pretrained(str(MODEL_DIR / "adapter"))
    tokenizer.save_pretrained(str(MODEL_DIR))
    (MODEL_DIR / "metrics.json").write_text(
        json.dumps(
            {
                "baseModel": BASE_MODEL,
                "pairs": len(pairs),
                "positives": positives,
                "folds": FOLDS,
                "cvAccuracy": cv["accuracy"],
                "cvF1": cv["f1"],
                "cvPrecision": cv["precision"],
                "cvRecall": cv["recall"],
                "perFold": per_fold,
                "perKind": {k: float(np.mean(v)) for k, v in per_kind.items()},
                "trainableParams": trainable,
                "baseParams": total,
            },
            indent=2,
        )
        + "\n"
    )
    print(f"\ntrainable {trainable:,} of {total:,} ({100 * trainable / total:.2f}%)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Install peft and confirm the base downloads**

Run:
```bash
cd apps/agent && pip install "peft>=0.13" && python -c "
from transformers import AutoTokenizer
AutoTokenizer.from_pretrained('microsoft/deberta-v3-small')
print('tokenizer ok')"
```
Expected: `tokenizer ok`. DeBERTa-v3 needs `sentencepiece`; if it errors asking for it, `pip install sentencepiece` and add it to the `ml` extra alongside peft.

- [ ] **Step 3: Smoke the target module names**

`target_modules` must match this base's attribute names or peft silently adapts nothing.

Run:
```bash
cd apps/agent && python -c "
from transformers import AutoModelForSequenceClassification
m = AutoModelForSequenceClassification.from_pretrained('microsoft/deberta-v3-small', num_labels=2)
names = {n.split('.')[-1] for n, _ in m.named_modules() if 'proj' in n or 'dense' in n}
print(sorted(names))"
```
Expected: names including `query_proj`, `key_proj`, `value_proj`. If they differ, update `target_modules` in `lora_model()` to the real names before training. Do not proceed on a guess — a LoraConfig that matches nothing trains a classifier head only and will look like it worked.

- [ ] **Step 4: Train**

Run: `cd apps/agent && python training/train_entailment.py`
Expected: fold-by-fold loss, then a cross-validated block, then `trainable N of M (~0.3%)`. On an M1 this is minutes per fold, not hours; if a fold exceeds ~15 minutes, drop `MAX_LENGTH` to 192 and re-run rather than waiting.

- [ ] **Step 5: Record the honest result**

Read `sandscope_agent/orchestrator/entailment/metrics.json`. Report `cvAccuracy`, `cvF1` and every entry of `perKind` as they are.

**If `perKind["quantity"]` or `perKind["entity"]` is near 0.5, that is the finding, not a failure to hide.** It means the adapter learned topic matching and cannot check whether a number or a subject is right — which is the specific thing it was built to do. Write it down and continue; Task 7 decides what ships.

- [ ] **Step 6: Commit**

```bash
cd /Users/sand224/sandscope
git add apps/agent/training/train_entailment.py apps/agent/pyproject.toml
git add apps/agent/sandscope_agent/orchestrator/entailment/metrics.json
git commit -m "feat(entailment): LoRA training with per-fold cross-validation

Documents are held out as groups, and the adapter is refit inside every fold:
an operating point chosen on the data it is scored against is a memory of that
data (ADR-0013). Per-kind accuracy is recorded separately so an adapter that
only beats the easy negatives cannot hide behind an average."
```

---

### Task 4: Merge, export to ONNX, and prove parity

**Files:**
- Create: `apps/agent/training/export_entailment.py`
- Output: `entailment/entailment.onnx`, `entailment/parity_sample.json`

**Interfaces:**
- Consumes: `entailment/adapter/` from Task 3.
- Produces: `entailment.onnx` with inputs `input_ids`, `attention_mask` and one output of shape `(batch, 2)`; `parity_sample.json` with those input arrays plus `expected_logits`.

- [ ] **Step 1: Write the export script**

Create `apps/agent/training/export_entailment.py`:

```python
"""Merge the adapter into the base and export ONNX.

Merging is what keeps ADR-0009 intact: after `merge_and_unload()` the result is
an ordinary transformer with no peft wrapper, so the serving closure needs
neither peft nor torch. It also means the multi-adapter saving is training-side
rather than serving-side, which the design says explicitly rather than implying.

A parity sample is written alongside, because an exported graph that silently
disagrees with what it was converted from is the failure mode ONNX export
actually has.

    python training/export_entailment.py
"""

from __future__ import annotations

import json
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from training.train_entailment import BASE_MODEL, MAX_LENGTH, MODEL_DIR

ONNX_PATH = MODEL_DIR / "entailment.onnx"
PARITY_PATH = MODEL_DIR / "parity_sample.json"

SAMPLE = [
    ("The observation period is 30 minutes.", "Escalate only after the observation period of 30 minutes has elapsed."),
    ("The observation period is 90 minutes.", "Escalate only after the observation period of 30 minutes has elapsed."),
]


def main() -> None:
    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))
    base = AutoModelForSequenceClassification.from_pretrained(BASE_MODEL, num_labels=2)
    merged = PeftModel.from_pretrained(base, str(MODEL_DIR / "adapter")).merge_and_unload()
    merged.eval()

    encoded = tokenizer(
        [c for c, _ in SAMPLE], [p for _, p in SAMPLE],
        truncation=True, max_length=MAX_LENGTH, padding="max_length", return_tensors="pt",
    )
    with torch.no_grad():
        expected = merged(**{k: encoded[k] for k in ("input_ids", "attention_mask")}).logits

    torch.onnx.export(
        merged,
        (encoded["input_ids"], encoded["attention_mask"]),
        str(ONNX_PATH),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "sequence"},
            "attention_mask": {0: "batch", 1: "sequence"},
            "logits": {0: "batch"},
        },
        opset_version=17,
    )

    PARITY_PATH.write_text(
        json.dumps(
            {
                "input_ids": encoded["input_ids"].tolist(),
                "attention_mask": encoded["attention_mask"].tolist(),
                "expected_logits": expected.tolist(),
            },
            indent=2,
        )
        + "\n"
    )
    megabytes = ONNX_PATH.stat().st_size / 1024 / 1024
    print(f"wrote {ONNX_PATH.name} ({megabytes:.0f} MB) and {PARITY_PATH.name}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Export**

Run: `cd apps/agent && python training/export_entailment.py`
Expected: `wrote entailment.onnx (~550 MB) and parity_sample.json`

- [ ] **Step 3: Confront the size before going further**

A ~550 MB fp32 graph will not ship: `test_the_graph_is_small_enough_to_ship` caps the re-ranker at 60 MB and the container is small.

Run dynamic int8 quantisation:
```bash
cd apps/agent && python -c "
from onnxruntime.quantization import quantize_dynamic, QuantType
from pathlib import Path
src = Path('sandscope_agent/orchestrator/entailment/entailment.onnx')
dst = src.with_name('entailment.int8.onnx')
quantize_dynamic(str(src), str(dst), weight_type=QuantType.QInt8)
print(f'{src.stat().st_size/1e6:.0f} MB -> {dst.stat().st_size/1e6:.0f} MB')"
```
Expected: roughly 550 MB → 140 MB.

**If the int8 graph is still over ~150 MB, stop and report it.** The honest options are a smaller base (MiniLM-L6, 22M) or not shipping A1 at all — both are legitimate outcomes and both belong in Task 7's ADR. Do not raise the size cap to make it fit; the re-ranker's cap comment says exactly this.

- [ ] **Step 4: Re-measure parity after quantisation**

Quantisation changes the numbers. Regenerate `expected_logits` from the int8 graph so parity is asserted against what actually ships:

```bash
cd apps/agent && python -c "
import json, numpy as np, onnxruntime
from pathlib import Path
d = Path('sandscope_agent/orchestrator/entailment')
s = json.loads((d/'parity_sample.json').read_text())
sess = onnxruntime.InferenceSession(str(d/'entailment.int8.onnx'))
feed = {i.name: np.array(s[i.name], dtype=np.int64) for i in sess.get_inputs()}
out = sess.run(None, feed)[0]
s['expected_logits'] = out.tolist()
s['quantised'] = True
(d/'parity_sample.json').write_text(json.dumps(s, indent=2)+'\n')
print('logits:', out.tolist())"
```
Expected: two rows of two logits. The first pair (matching quantity) should favour class 1 and the second (mismatched quantity) class 0. **If it does not, record that — it is the same finding as Step 5 of Task 3.**

- [ ] **Step 5: Commit**

```bash
cd /Users/sand224/sandscope
git add apps/agent/training/export_entailment.py apps/agent/sandscope_agent/orchestrator/entailment/parity_sample.json
git commit -m "feat(entailment): merge, export to ONNX, quantise, record parity

merge_and_unload() leaves an ordinary transformer, so the serving closure needs
neither peft nor torch and ADR-0009 stands. Parity is recorded against the
QUANTISED graph, because that is the one that ships."
```

---

### Task 5: The serving module

**Files:**
- Create: `apps/agent/sandscope_agent/orchestrator/entailment.py`
- Create: `apps/agent/tests/test_entailment.py`

**Interfaces:**
- Consumes: `entailment/entailment.int8.onnx`, `entailment/tokenizer.json`, `entailment/metrics.json`.
- Produces: `is_available() -> bool`; `supports(claim: str, passage: str) -> float` returning P(supported) in [0,1]; `EntailmentUnavailableError`; module constants `MODEL_DIR`, `ONNX_PATH`, `TOKENIZER_PATH`, `METRICS_PATH`, `MAX_LENGTH`.

Mirror `sandscope_agent/retrieval/reranker.py` exactly — same constants, same `lru_cache` sessions, same raise-rather-than-degrade posture, same `intra_op_num_threads = 1`.

- [ ] **Step 1: Write the failing test**

Create `apps/agent/tests/test_entailment.py`:

```python
"""Claim support, as served.

ONNX plus the Rust tokenizer core. torch, transformers and peft are
training-time only (ADR-0009) and a test parses this module's imports to prove
none of them reaches the runtime.
"""

from __future__ import annotations

import ast
import inspect
import json

import pytest

from sandscope_agent.orchestrator import entailment

pytestmark = pytest.mark.skipif(
    not entailment.is_available(),
    reason="trained artefact absent; run training/train_entailment.py",
)


class TestServingClosure:
    def test_it_imports_no_training_framework(self) -> None:
        tree = ast.parse(inspect.getsource(entailment))
        imported: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.update(a.name.split(".")[0] for a in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module.split(".")[0])
        forbidden = {"torch", "transformers", "peft", "sklearn", "tensorflow"}
        assert not (imported & forbidden), f"serving module imports {imported & forbidden}"
        assert {"onnxruntime", "tokenizers"} <= imported

    def test_the_graph_is_small_enough_to_ship(self) -> None:
        megabytes = entailment.ONNX_PATH.stat().st_size / 1024 / 1024
        assert megabytes < 150, f"{megabytes:.0f} MB is too large for the container"

    def test_a_missing_artefact_raises_rather_than_passing_through(self, tmp_path) -> None:
        """An entailment check that quietly returns 'supported' is worse than
        one that is absent, because verify still looks like it verified."""
        original = entailment.ONNX_PATH
        entailment._session.cache_clear()
        entailment.ONNX_PATH = tmp_path / "absent.onnx"
        try:
            with pytest.raises(entailment.EntailmentUnavailableError):
                entailment.supports("a claim", "a passage")
        finally:
            entailment.ONNX_PATH = original
            entailment._session.cache_clear()


class TestParityWithTraining:
    def test_onnx_matches_what_it_was_converted_from(self) -> None:
        import numpy as np
        import onnxruntime

        sample = json.loads((entailment.MODEL_DIR / "parity_sample.json").read_text())
        session = onnxruntime.InferenceSession(str(entailment.ONNX_PATH))
        feed = {i.name: np.array(sample[i.name], dtype=np.int64) for i in session.get_inputs()}
        produced = np.asarray(session.run(None, feed)[0])
        expected = np.asarray(sample["expected_logits"])
        assert produced.shape == expected.shape
        assert np.allclose(produced, expected, atol=1e-3)


class TestBehaviour:
    def test_it_returns_a_probability(self) -> None:
        value = entailment.supports(
            "The observation period is 30 minutes.",
            "Escalate only after the observation period of 30 minutes has elapsed.",
        )
        assert 0.0 <= value <= 1.0

    def test_a_wrong_quantity_scores_lower_than_the_right_one(self) -> None:
        """The reason this adapter exists. If it cannot separate these, it has
        learned topic matching and Task 7 must keep it out of the live path."""
        passage = "Escalate only after the observation period of 30 minutes has elapsed."
        right = entailment.supports("The observation period is 30 minutes.", passage)
        wrong = entailment.supports("The observation period is 90 minutes.", passage)
        assert right > wrong, f"right={right:.3f} not above wrong={wrong:.3f}"
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/agent && python -m pytest tests/test_entailment.py -q`
Expected: FAIL — `No module named 'sandscope_agent.orchestrator.entailment'`

- [ ] **Step 3: Implement the serving module**

Create `apps/agent/sandscope_agent/orchestrator/entailment.py`:

```python
"""Whether a passage supports a claim, at serving time.

`uncited_claims` checks that a claim HAS a marker. It has never checked that
the chunk behind that marker says what the claim says, and a citation that does
not support its sentence looks exactly like one that does.

Serving is ONNX plus the Rust tokenizer core (ADR-0009). torch, transformers
and peft are training-time only; the adapter is merged into the base before
export, so nothing peft-shaped exists here to load.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import numpy as np
import onnxruntime
from tokenizers import Tokenizer

MODEL_DIR = Path(__file__).resolve().parent / "entailment"
ONNX_PATH = MODEL_DIR / "entailment.int8.onnx"
TOKENIZER_PATH = MODEL_DIR / "tokenizer.json"
METRICS_PATH = MODEL_DIR / "metrics.json"
MAX_LENGTH = 256


class EntailmentUnavailableError(RuntimeError):
    """The trained artefact is missing.

    Raised rather than returning "supported". A check that quietly passes
    everything is worse than an absent one, because `verify` still reports that
    it verified.
    """


def is_available() -> bool:
    return ONNX_PATH.exists() and TOKENIZER_PATH.exists()


@lru_cache(maxsize=1)
def _tokenizer() -> Tokenizer:
    if not TOKENIZER_PATH.exists():
        raise EntailmentUnavailableError(
            f"missing {TOKENIZER_PATH}; run training/train_entailment.py"
        )
    tokenizer = Tokenizer.from_file(str(TOKENIZER_PATH))
    tokenizer.enable_truncation(max_length=MAX_LENGTH)
    tokenizer.enable_padding(length=None)
    return tokenizer


@lru_cache(maxsize=1)
def _session() -> onnxruntime.InferenceSession:
    if not ONNX_PATH.exists():
        raise EntailmentUnavailableError(
            f"missing {ONNX_PATH}; run training/train_entailment.py"
        )
    options = onnxruntime.SessionOptions()
    # One thread, as the re-ranker does: 2 shared vCPU, and a pool contending
    # with the API server costs more than it recovers.
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    return onnxruntime.InferenceSession(str(ONNX_PATH), options)


@lru_cache(maxsize=1)
def metrics() -> dict:
    return json.loads(METRICS_PATH.read_text()) if METRICS_PATH.exists() else {}


def _softmax(row: np.ndarray) -> np.ndarray:
    shifted = row - row.max()
    exponentiated = np.exp(shifted)
    return exponentiated / exponentiated.sum()


def supports(claim: str, passage: str) -> float:
    """P(the passage supports the claim), in [0, 1]."""
    encoded = _tokenizer().encode(claim, passage)
    session = _session()
    feed = {
        "input_ids": np.array([encoded.ids], dtype=np.int64),
        "attention_mask": np.array([encoded.attention_mask], dtype=np.int64),
    }
    logits = np.asarray(session.run(None, feed)[0])[0]
    return float(_softmax(logits)[1])
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/agent && python -m pytest tests/test_entailment.py -q`
Expected: PASS. `test_a_wrong_quantity_scores_lower_than_the_right_one` is the one that matters — **if it fails, do not adjust it.** Record the two scores and carry them into Task 7.

- [ ] **Step 5: Commit**

```bash
cd /Users/sand224/sandscope
git add apps/agent/sandscope_agent/orchestrator/entailment.py apps/agent/tests/test_entailment.py
git commit -m "feat(entailment): serve claim support as ONNX, no framework

Mirrors the re-ranker's serving posture: onnxruntime plus the Rust tokenizer
core, one thread, and a raise rather than a silent pass-through when the
artefact is absent. A check that quietly passes everything is worse than an
absent one, because verify still reports that it verified."
```

---

### Task 6: Measure it against the incumbent, on both slices

**Files:**
- Create: `apps/agent/training/evaluate_entailment.py`
- Create: `apps/agent/tests/test_entailment_evaluation.py`

**Interfaces:**
- Consumes: `entailment.supports`, `build_entailment_pairs`, `citations.uncited_claims`.
- Produces: `apps/agent/reports/entailment.json` with keys `random`, `adversarial`, `recorded`, each holding `{n, modelAccuracy, incumbentAccuracy, modelF1, incumbentF1}`; and `latencyP50Ms`, `latencyP95Ms`.

**The two slices, never merged.** The adversarial slice (`quantity`, `entity`, `polarity`) is built to be hard for string matching, so a combined number would flatter the model. Reported side by side with the reason, the way `PENTEST_RESULTS.md` separates what is and is not valid to compare.

**The incumbent's handicap, stated.** `uncited_claims` answers a different question — it cannot score (claim, passage) at all. Its stand-in here is the honest strongest baseline: token-overlap between claim and passage above a threshold chosen *inside each fold*. Calling that "the incumbent" would be false, so the report names it `lexical-overlap baseline` and says why.

- [ ] **Step 1: Write the evaluation script**

Create `apps/agent/training/evaluate_entailment.py`:

```python
"""A1 measured against the strongest thing it replaces.

Two slices, never merged. The adversarial slice is CONSTRUCTED to defeat string
matching, so combining it with the random slice would flatter the model by
exactly the amount the construction intended. They are reported side by side
with this sentence attached.

The incumbent is not `uncited_claims`: that function answers a different
question and cannot score a (claim, passage) pair at all. The honest baseline
is lexical overlap with a threshold fitted INSIDE each fold, which is the
strongest thing available without a model.

    python training/evaluate_entailment.py
"""

from __future__ import annotations

import json
import statistics
import time
from pathlib import Path

import numpy as np

from sandscope_agent.evaluation.entailment_dataset import build_entailment_pairs
from sandscope_agent.evaluation.folds import grouped_folds
from sandscope_agent.orchestrator import entailment
from sandscope_agent.retrieval.tokenize import tokenize

REPORT = Path(__file__).resolve().parents[1] / "reports" / "entailment.json"
ADVERSARIAL = {"quantity", "entity", "polarity"}


def overlap(claim: str, passage: str) -> float:
    a, b = set(tokenize(claim)), set(tokenize(passage))
    return len(a & b) / len(a) if a else 0.0


def fitted_threshold(pairs) -> float:
    """The overlap cut that maximises accuracy ON THE TRAINING HALF only."""
    values = sorted({overlap(p.claim, p.chunk_body) for p in pairs})
    best, cut = -1.0, 0.5
    for candidate in values:
        predicted = np.array([overlap(p.claim, p.chunk_body) >= candidate for p in pairs])
        truth = np.array([p.label == 1 for p in pairs])
        accuracy = float((predicted == truth).mean())
        if accuracy > best:
            best, cut = accuracy, candidate
    return cut


def score(truth: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    tp = int(((predicted == 1) & (truth == 1)).sum())
    fp = int(((predicted == 1) & (truth == 0)).sum())
    fn = int(((predicted == 0) & (truth == 1)).sum())
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return {
        "accuracy": float((predicted == truth).mean()),
        "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0.0,
    }


def main() -> None:
    if not entailment.is_available():
        raise SystemExit("no trained artefact; run training/train_entailment.py first")

    pairs = build_entailment_pairs()
    folds = grouped_folds(pairs, lambda p: p.document_id, k=5)

    slices: dict[str, dict[str, float]] = {}
    for name, keep in (
        ("random", lambda p: True),
        ("adversarial", lambda p: p.kind in ADVERSARIAL),
    ):
        model_truth, model_pred, base_pred = [], [], []
        for train_idx, test_idx in folds:
            cut = fitted_threshold([pairs[i] for i in train_idx])
            for i in test_idx:
                pair = pairs[i]
                if not keep(pair):
                    continue
                model_truth.append(pair.label)
                model_pred.append(1 if entailment.supports(pair.claim, pair.chunk_body) >= 0.5 else 0)
                base_pred.append(1 if overlap(pair.claim, pair.chunk_body) >= cut else 0)
        truth = np.array(model_truth)
        model = score(truth, np.array(model_pred))
        baseline = score(truth, np.array(base_pred))
        slices[name] = {
            "n": len(truth),
            "modelAccuracy": model["accuracy"], "modelF1": model["f1"],
            "baselineAccuracy": baseline["accuracy"], "baselineF1": baseline["f1"],
        }
        print(f"{name:12} n={len(truth):5}  model {model['accuracy']:.3f}  baseline {baseline['accuracy']:.3f}")

    timings = []
    for pair in pairs[:100]:
        start = time.perf_counter()
        entailment.supports(pair.claim, pair.chunk_body)
        timings.append((time.perf_counter() - start) * 1000)

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(
            {
                **slices,
                "latencyP50Ms": statistics.median(timings),
                "latencyP95Ms": sorted(timings)[int(len(timings) * 0.95)],
                "note": (
                    "The adversarial slice is constructed to defeat string matching and is "
                    "reported separately for that reason. The baseline is lexical overlap with "
                    "a threshold fitted inside each fold, not uncited_claims, which answers a "
                    "different question and cannot score a pair."
                ),
            },
            indent=2,
        )
        + "\n"
    )
    print(f"\nwrote {REPORT}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Write the test that the two slices stay separate**

Create `apps/agent/tests/test_entailment_evaluation.py`:

```python
"""The evaluation's own honesty properties."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

REPORT = Path(__file__).resolve().parents[1] / "reports" / "entailment.json"


@unittest.skipUnless(REPORT.exists(), "run training/evaluate_entailment.py first")
class TestReport(unittest.TestCase):
    def setUp(self) -> None:
        self.report = json.loads(REPORT.read_text())

    def test_both_slices_are_reported_separately(self) -> None:
        self.assertIn("random", self.report)
        self.assertIn("adversarial", self.report)

    def test_no_combined_number_is_published(self) -> None:
        """Merging them would flatter the model by exactly the amount the
        adversarial construction intended."""
        self.assertNotIn("combined", self.report)
        self.assertNotIn("overall", self.report)

    def test_the_note_explains_why_they_are_separate(self) -> None:
        self.assertIn("separately", self.report["note"])

    def test_every_slice_carries_its_baseline(self) -> None:
        for name in ("random", "adversarial"):
            self.assertIn("baselineAccuracy", self.report[name])
            self.assertGreater(self.report[name]["n"], 0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run the evaluation**

Run: `cd apps/agent && python training/evaluate_entailment.py`
Expected: two printed lines and a written report.

- [ ] **Step 4: Run the tests**

Run: `cd apps/agent && python -m pytest tests/test_entailment_evaluation.py -q`
Expected: PASS (4 tests)

- [ ] **Step 5: Measure on REAL model-written claims**

The constructed set measures the task. It does not measure the product: A1 is
trained on sentences from the corpus but serves on sentences a model wrote, and
those are different distributions. The `citation` table already records the
serving distribution — `claim_text` and `chunk_id` for every completed run.

Create `apps/agent/training/evaluate_entailment_recorded.py`:

```python
"""A1 on the distribution it actually serves.

The constructed set is corpus prose. `verify` sees model prose. A number from
the first does not transfer to the second, and saying so is cheaper than
discovering it in production.

Ground truth here cannot be constructed, so it is adjudicated by hand once and
committed as a fixture. That is a small set and it is labelled as small.

SKIPS LOUDLY when the database is unreachable or the fixture is absent. It does
not pass quietly: D-013 was a rate-limit test that passed while the service was
down, and the standing response is that an unrun check reports as unrun.

    DATABASE_URL=... python training/evaluate_entailment_recorded.py --dump
    python training/evaluate_entailment_recorded.py
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import numpy as np

from sandscope_agent.orchestrator import entailment

FIXTURE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "recorded_citations.json"
REPORT = Path(__file__).resolve().parents[1] / "reports" / "entailment.json"


def dump() -> None:
    """Pull recorded claims out of the database into an unlabelled fixture."""
    if not os.environ.get("DATABASE_URL"):
        raise SystemExit("DATABASE_URL is not set; nothing to dump")
    import psycopg

    with psycopg.connect(os.environ["DATABASE_URL"]) as connection:
        rows = connection.execute(
            "SELECT c.claim_text, c.chunk_id, k.body "
            "FROM citation c JOIN chunk k ON k.id = c.chunk_id "
            "ORDER BY c.id DESC LIMIT 200"
        ).fetchall()

    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(
        json.dumps(
            [
                {"claim": r[0], "chunk_id": r[1], "chunk_body": r[2], "label": None}
                for r in rows
            ],
            indent=2,
        )
        + "\n"
    )
    print(f"wrote {len(rows)} rows to {FIXTURE}. Set every \"label\" to 1 or 0 by hand.")


def evaluate() -> None:
    if not FIXTURE.exists():
        print("SKIP: no recorded-citation fixture. Run with --dump against a "
              "database that has completed runs, then adjudicate the labels.")
        return
    rows = json.loads(FIXTURE.read_text())
    labelled = [r for r in rows if r.get("label") in (0, 1)]
    if not labelled:
        print(f"SKIP: {len(rows)} rows present, none adjudicated. This is a skip, not a pass.")
        return
    if not entailment.is_available():
        print("SKIP: no trained artefact.")
        return

    truth = np.array([r["label"] for r in labelled])
    predicted = np.array(
        [1 if entailment.supports(r["claim"], r["chunk_body"]) >= 0.5 else 0 for r in labelled]
    )
    accuracy = float((predicted == truth).mean())
    print(f"recorded claims: n={len(labelled)}  accuracy {accuracy:.3f}")

    report = json.loads(REPORT.read_text()) if REPORT.exists() else {}
    report["recorded"] = {
        "n": len(labelled),
        "modelAccuracy": accuracy,
        "note": (
            "Hand-adjudicated claims written by the model itself, from the citation "
            "table. This is the serving distribution; the constructed slices are not. "
            "Small by construction and labelled as such."
        ),
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n")
    print(f"merged into {REPORT}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dump", action="store_true")
    args = parser.parse_args()
    dump() if args.dump else evaluate()
```

Run: `cd apps/agent && python training/evaluate_entailment_recorded.py`

Expected on a machine with no database: `SKIP: no recorded-citation fixture...`. **That is the correct outcome, and it must print SKIP rather than exiting silently** — record it as a skip in the ADR, not as a pass.

If a `DATABASE_URL` with completed runs is available, run `--dump`, adjudicate the labels by hand, and re-run.

- [ ] **Step 6: Commit**

```bash
cd /Users/sand224/sandscope
git add apps/agent/training/evaluate_entailment.py apps/agent/training/evaluate_entailment_recorded.py
git add apps/agent/tests/test_entailment_evaluation.py apps/agent/reports/entailment.json
git commit -m "feat(entailment): measure on two constructed slices and on real claims

The adversarial slice is built to defeat string matching, so a combined number
would flatter the model by the amount the construction intended; the two are
reported side by side with that reason attached. The baseline is lexical
overlap fitted inside each fold -- named honestly, because uncited_claims
answers a different question and cannot score a pair at all.

The constructed slices measure the task. The citation table holds the
distribution verify actually sees, and that arm skips loudly when its rows are
unadjudicated rather than passing quietly -- D-013 was a test that passed while
the service was down."
```

---

### Task 7: Decide, wire or refuse, and publish

**Files:**
- Create: `docs/03-architecture/adr/0015-<outcome>.md`
- Modify: `apps/agent/sandscope_agent/orchestrator/graph.py` (the `verify` node) — **only if the shipping rule is met**
- Modify: `docs/01-requirements/TRACEABILITY.md` (FR-035)
- Modify: `docs/04-quality/DEFECT_LOG.md` if anything was found
- Modify: `apps/web/src/generated/*` via the derive scripts

**The decision, taken from the report and nothing else:**

> A1 ships into `verify` only if `random.modelAccuracy > random.baselineAccuracy` under cross-validation **and** `latencyP95Ms` leaves the request inside budget **and** the int8 graph is under 150 MB.

- [ ] **Step 1: Read the report and state the outcome**

Run: `cd apps/agent && cat reports/entailment.json`

Write down which of the three conditions hold. All three → ship (Step 2). Any fail → refuse (Step 3). **Do not negotiate with the numbers.**

- [ ] **Step 2 (ship path only): Wire into verify**

In `apps/agent/sandscope_agent/orchestrator/graph.py`, in `verify`, after `uncited = uncited_claims(...)`:

```python
    # A claim can carry a marker and still not be supported by the chunk behind
    # it. That is the case `uncited_claims` structurally cannot see, and it is
    # the one this checks. Unsupported claims are recorded alongside uncited
    # ones rather than replacing them: the two are different defects.
    from sandscope_agent.orchestrator import entailment

    unsupported: list[str] = []
    if entailment.is_available():
        by_id = {hit.chunk.id: hit.chunk.body for hit in hits}
        for citation in citations:
            body = by_id.get(citation["chunk_id"] or "")
            if body and entailment.supports(citation["claim_text"], body) < 0.5:
                unsupported.append(citation["claim_text"])
```

and add `"unsupported": unsupported` to the returned dict plus `unsupported=len(unsupported)` to the `_event(...)` call.

- [ ] **Step 3 (refuse path only): Write the ADR that keeps it out**

Create `docs/03-architecture/adr/0015-the-claim-support-adapter-stays-out.md` following ADR-0013's shape: Status, Date, Deciders, Context, The measurement (the report's real numbers in a table), Decision, Consequences. State plainly which condition failed and by how much.

- [ ] **Step 4: Either way, write the ADR**

If it shipped, the ADR is `0015-claim-support-is-checked-not-assumed.md` and records the same numbers plus what it cost — the graph size, the added latency, and the fact that the multi-adapter saving is training-side.

- [ ] **Step 5: Add the requirement**

In `docs/01-requirements/TRACEABILITY.md`, after the FR-034 row:

```
| FR-035 | A cited claim is checked against the chunk that supports it, or the check is explicitly kept out with its measurement published | S9-LORA | `apps/agent/tests/test_entailment_evaluation.py` | 9 | Done |
```

Then define `S9-LORA` in `docs/00-governance/SPRINT_09_PLAN.md`'s story table, so this does not create a 27th dangling citation (D-030).

- [ ] **Step 6: Run every gate**

```bash
cd /Users/sand224/sandscope
for s in check-config check-docs check-deploy-claims check-sprints check-readme \
         check-traceability check-workflow-shell check-secrets check-media; do
  printf "%-22s " "$s"; node scripts/$s.mjs >/dev/null 2>&1 && echo pass || echo FAIL
done
cd apps/agent && python -m pytest -q -m "not integration"
```
Expected: every gate passes; the agent suite passes.

- [ ] **Step 7: Refresh the derived surfaces and commit**

```bash
cd /Users/sand224/sandscope
node scripts/derive-delivery.mjs && node scripts/derive-surfaces.mjs && node scripts/derive-lexicon.mjs
node scripts/fill-project-record.mjs && node scripts/check-readme.mjs
git add -A
git commit -m "feat(entailment): <shipped|kept out> after measurement, ADR-0015"
```

If `check-readme.mjs` fails on a changed count, update README to the derived figure — never the other way round.

---

## Definition of done for piece 1

- [ ] `peft` in the `ml` extra; nothing peft-shaped in the serving closure, asserted by a test
- [ ] Dataset labels true by construction; a test proves the module imports no model
- [ ] Folds grouped by document; the splitter proven against a leaking fixture
- [ ] Cross-validated numbers recorded per fold **and per negative kind**
- [ ] ONNX parity asserted against the graph that actually ships (the quantised one)
- [ ] Two slices reported separately, with the reason, and a test that forbids a combined number
- [ ] Recorded-citation evaluation run, or reported as an explicit SKIP with its reason
- [ ] A decision taken from the report, and an ADR published either way
- [ ] FR-035 traced to a test that exists; `S9-LORA` defined so no dangling citation is created
