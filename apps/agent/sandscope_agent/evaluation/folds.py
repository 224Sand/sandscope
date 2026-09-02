"""Grouped k-fold splitting.

Written here rather than taken from scikit-learn for the same reason
`evaluation/statistics.py` is: the serving closure carries neither, and a test
checks this agrees with the reference implementation.

Sentences drawn from one document are near-duplicates of each other. A random
split puts a sentence in the training half and its neighbour in the test half,
and the resulting score measures memorisation. Documents are the unit.
"""

from __future__ import annotations

import random
from collections.abc import Callable, Sequence
from typing import TypeVar

T = TypeVar("T")


def grouped_folds(
    items: Sequence[T],
    group_of: Callable[[T], str],
    k: int = 5,
    seed: int = 20260902,
) -> list[tuple[list[int], list[int]]]:
    """k folds in which no group appears on both sides of a split.

    Groups are shuffled for the seed, then placed largest-first into whichever
    fold is currently smallest. That keeps fold sizes close without ever
    splitting a group, which is the property that matters -- an even split that
    straddles a document is worth less than an uneven one that does not.
    """
    by_group: dict[str, list[int]] = {}
    for index, item in enumerate(items):
        by_group.setdefault(group_of(item), []).append(index)

    if k > len(by_group):
        raise ValueError(f"{k} folds requested but only {len(by_group)} groups exist")
    if k < 2:
        raise ValueError(f"{k} folds is not a cross-validation")

    groups = sorted(by_group.items(), key=lambda kv: kv[0])
    random.Random(seed).shuffle(groups)
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
