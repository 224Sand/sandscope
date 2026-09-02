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

        def group(s: str) -> str:
            return s.split("-")[0]

        # A deliberately WRONG splitter: contiguous slices ignoring the group.
        #
        # The stride must not be a multiple of the group size. The first version
        # of this fixture used len(items)//4 == 15 against 5-item documents, so
        # its slices landed exactly on document boundaries and it did not leak
        # at all -- the assertion below caught that, which is the reason it is
        # written as a property of the fixture rather than a comment claiming
        # the fixture is bad.
        size = len(items) // 4 + 1
        leaky = [
            (
                [j for j in range(len(items)) if not (i * size <= j < (i + 1) * size)],
                list(range(i * size, (i + 1) * size)),
            )
            for i in range(4)
        ]
        straddled = any(
            {group(items[i]) for i in train} & {group(items[i]) for i in test}
            for train, test in leaky
        )
        self.assertTrue(straddled, "the leak fixture does not actually leak")

    def test_the_real_splitter_does_not_leak_on_the_same_data(self) -> None:
        """The other half of the proof: the fixture leaks, ours does not."""
        items = [f"doc{d}-item{i}" for d in range(12) for i in range(5)]

        def group(s: str) -> str:
            return s.split("-")[0]

        for train, test in grouped_folds(items, group, k=4):
            self.assertFalse({group(items[i]) for i in train} & {group(items[i]) for i in test})


if __name__ == "__main__":
    unittest.main()
