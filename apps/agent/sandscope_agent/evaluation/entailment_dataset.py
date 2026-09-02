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

#: Negatives that differ from their positive by one token or one value. Kept
#: separate from `other-chunk`, which is a real serving case but which a
#: lexical-overlap baseline separates perfectly -- so a set dominated by it
#: measures overlap and calls the result entailment.
HARD_KINDS = frozenset({"quantity", "entity", "unit", "ordinal", "comparator", "polarity"})

#: Kinds with too few examples for a per-fold number, DECLARED rather than
#: quietly averaged in. Only 17 claim-sentences in this corpus name a service,
#: so five folds report on roughly three entity examples each -- a number that
#: would be published and read as a measurement. Evaluation must report these
#: in aggregate and label them thin. A kind that becomes thin without being
#: declared fails a test.
THIN_KINDS = frozenset({"entity"})

#: Auxiliaries a polarity flip can attach to.
_POLARITY = [
    ("must not", "must"),
    ("cannot", "can"),
    ("should not", "should"),
    ("does not", "does"),
    ("is not", "is"),
    ("are not", "are"),
    ("was not", "was"),
    ("were not", "were"),
]
_QUANTITY = re.compile(r"\b(\d+(?:\.\d+)?)\b")
#: Multipliers tried in order until one produces a numeral that does not
#: CONTAIN the original. 30 -> 300 reads as changed but leaves "30" in the
#: string, and a model can match the substring without reading the value.
_FACTORS = (3, 2, 5, 7, 4)
#: Units a duration or size can be restated in. Swapping the unit while leaving
#: the number alone is the hardest negative this corpus can produce: every token
#: but one is shared with the positive.
_UNITS = {
    "second": "hour",
    "seconds": "hours",
    "minute": "second",
    "minutes": "seconds",
    "hour": "minute",
    "hours": "minutes",
    "day": "hour",
    "days": "hours",
    "week": "day",
    "weeks": "days",
    "month": "week",
    "months": "weeks",
    "ms": "s",
    "mb": "gb",
    "gb": "mb",
}
#: Ordered labels. The corpus is full of these -- the comment above
#: `_CONTAINS_A_VALUE` in evidence.py records that "Tier 0" and "Severity 1" are
#: everywhere -- and moving one changes the fact without changing the wording.
_ORDINALS = re.compile(r"\b(tier|severity|sev|p)\s*([0-3])\b", re.IGNORECASE)
#: Comparators. Flipping one inverts the claim while preserving every noun.
_COMPARATORS = [
    ("above", "below"),
    ("below", "above"),
    ("more than", "fewer than"),
    ("fewer than", "more than"),
    ("greater than", "less than"),
    ("less than", "greater than"),
    ("at least", "at most"),
    ("at most", "at least"),
    ("before", "after"),
    ("after", "before"),
    ("exceeds", "stays under"),
]


@dataclass(frozen=True, slots=True)
class EntailmentPair:
    claim: str
    chunk_id: str
    chunk_body: str
    #: 1 = the chunk supports the claim, 0 = it does not.
    label: int
    #: How the example was constructed: verbatim | polarity | quantity |
    #: entity | unit | ordinal | comparator | other-chunk. Carried so evaluation
    #: can report per-kind, because
    #: an adapter that only beats the easy negatives has not earned its place.
    kind: str
    #: Grouping key for cross-validation. Sentences from one document must
    #: never straddle a fold boundary or the score is leakage.
    document_id: str


def negate_polarity(sentence: str) -> str | None:
    """Flip the sentence's polarity, or None when no auxiliary is present."""
    for negative, _ in _POLARITY:
        if re.search(rf"\b{negative}\b", sentence, re.IGNORECASE):
            return None  # already negative; flipping back would make it true
    for negative, positive in _POLARITY:
        match = re.search(rf"\b{positive}\b", sentence, re.IGNORECASE)
        if match:
            return sentence[: match.start()] + negative + sentence[match.end() :]
    return None


def perturb_quantity(sentence: str, rng: random.Random | None = None) -> str | None:
    """Change a stated quantity, leaving everything else identical.

    The replacement must not contain the original as a substring. Multiplying
    30 by ten gives 300, which reads as a changed value but lets a model match
    "30" without ever reading the number -- the exact shortcut this negative
    exists to close off.
    """
    match = _QUANTITY.search(sentence)
    if not match:
        return None
    original = match.group(1)
    order = list(_FACTORS)
    (rng or random.Random(SEED)).shuffle(order)
    for factor in order:
        value = float(original) * factor
        changed = str(int(value)) if value == int(value) else f"{value:.1f}"
        if original not in changed and changed != original:
            return sentence[: match.start()] + changed + sentence[match.end() :]
    return None


def swap_unit(sentence: str) -> str | None:
    """Restate a quantity in a different unit, leaving the number alone.

    The hardest negative available here: "30 minutes" and "30 seconds" share
    every token but one, so nothing short of reading the unit separates them.
    """
    for original, replacement in _UNITS.items():
        match = re.search(rf"\b\d+(?:\.\d+)?\s+{original}\b", sentence, re.IGNORECASE)
        if match:
            return (
                sentence[: match.start()]
                + re.sub(rf"\b{original}\b", replacement, match.group(0), flags=re.IGNORECASE)
                + sentence[match.end() :]
            )
    return None


def swap_ordinal(sentence: str) -> str | None:
    """Move a tier or severity label one step, changing the fact only."""
    match = _ORDINALS.search(sentence)
    if not match:
        return None
    level = int(match.group(2))
    changed = level + 1 if level < 3 else level - 1
    return sentence[: match.start()] + f"{match.group(1)} {changed}" + sentence[match.end() :]


def flip_comparator(sentence: str) -> str | None:
    """Invert a comparison, preserving every noun in the sentence."""
    for original, replacement in _COMPARATORS:
        match = re.search(rf"\b{original}\b", sentence, re.IGNORECASE)
        if match:
            return sentence[: match.start()] + replacement + sentence[match.end() :]
    return None


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
    """Service names from the estate's public accessor.

    `estate.SERVICES` does not exist; the tuple is private and `services()` is
    the supported way in. Checked rather than assumed, because a name that
    silently matches nothing would produce zero entity negatives and the
    dataset would look fine.
    """
    from sandscope_agent.seed import estate

    return sorted({service.name for service in estate.services()})


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
                ("unit", swap_unit(sentence)),
                ("ordinal", swap_ordinal(sentence)),
                ("comparator", flip_comparator(sentence)),
            ):
                if made and made != sentence:
                    pairs.append(
                        EntailmentPair(made, chunk.id, chunk.body, 0, kind, chunk.document_id)
                    )
            if neighbour is not None:
                pairs.append(
                    EntailmentPair(
                        sentence,
                        neighbour.id,
                        neighbour.body,
                        0,
                        "other-chunk",
                        neighbour.document_id,
                    )
                )
    rng.shuffle(pairs)
    return pairs
