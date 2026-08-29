"""FR-030: the recall computation the ANN benchmark reports, unit-tested.

The full benchmark (`training/benchmark_ann.py`) needs a live Postgres with the
pgvector extension and measures up to 20,000 vectors — a real integration
artifact, not something that belongs in the offline suite that runs on every
push. What CAN and should run everywhere is the arithmetic it reports: recall@k
is a pure function of two ID lists, and it was never actually asserted anywhere
before this file existed, despite being the single number the entire benchmark
exists to produce.
"""

from __future__ import annotations

import pytest

from training.benchmark_ann import recall_at_k


class TestRecallAtK:
    def test_identical_results_are_perfect_recall(self) -> None:
        assert recall_at_k([1, 2, 3], [1, 2, 3]) == 1.0

    def test_disjoint_results_are_zero_recall(self) -> None:
        assert recall_at_k([4, 5, 6], [1, 2, 3]) == 0.0

    def test_partial_overlap_is_the_correct_fraction(self) -> None:
        assert recall_at_k([1, 2, 9], [1, 2, 3]) == pytest.approx(2 / 3)

    def test_order_does_not_matter(self) -> None:
        """Recall asks WHICH neighbours were found, not in what order — ranking
        quality is a different, separate question this function does not
        answer."""
        assert recall_at_k([3, 1, 2], [1, 2, 3]) == 1.0

    def test_extra_irrelevant_hits_do_not_inflate_recall(self) -> None:
        """A method returning 50 candidates to guarantee overlap should not
        score better than one returning exactly k."""
        assert recall_at_k([1, 2, 3, 4, 5, 6, 7], [1, 2, 3]) == 1.0

    def test_exact_search_against_its_own_ground_truth_is_always_one(self) -> None:
        """The benchmark's baseline method IS the ground truth, by construction
        (training/benchmark_ann.py's module docstring). If this were ever not
        1.0, the bug would be in how truth is generated, not in any ANN index."""
        ground_truth = list(range(10))
        assert recall_at_k(ground_truth, ground_truth) == 1.0

    def test_no_expected_neighbours_is_vacuously_perfect(self) -> None:
        """An empty ground truth set (e.g. a corpus of zero vectors) cannot be
        scored as a failure to find neighbours that do not exist."""
        assert recall_at_k([1, 2, 3], []) == 1.0
