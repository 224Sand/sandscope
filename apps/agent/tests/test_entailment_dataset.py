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

    #: Negatives that differ from their positive by one token or one value.
    #: `other-chunk` is deliberately excluded: it is a real serving case, but a
    #: lexical-overlap baseline separates it perfectly.
    HARD = ed.HARD_KINDS

    def test_negatives_are_near_identical_to_their_positives(self) -> None:
        """The whole point. A negative that shares no words with its positive
        is separable by overlap and teaches the model nothing."""
        pairs = ed.build_entailment_pairs()
        hard = [p for p in pairs if p.kind in self.HARD]
        for pair in hard:
            self.assertEqual(pair.label, 0)

    def test_hard_negatives_are_a_large_enough_SHARE_to_matter(self) -> None:
        """A raw count is the wrong property and let a bad dataset through.

        The first version of this asserted `len(hard) > 50`. It passed with 91
        hard negatives against 383 easy ones -- 9% of the set -- so a model
        scoring on lexical overlap alone reached ~91% and the suite called it
        entailment. What matters is the SHARE: the ceiling for an
        overlap-only baseline is 100% minus the hard fraction.
        """
        pairs = ed.build_entailment_pairs()
        hard = [p for p in pairs if p.kind in self.HARD]
        share = len(hard) / len(pairs)
        self.assertGreater(
            share,
            0.25,
            f"only {share:.0%} of pairs are hard; an overlap baseline would score "
            f"~{1 - share:.0%} and the measurement would be meaningless",
        )

    def test_thin_kinds_are_declared_rather_than_quietly_averaged_in(self) -> None:
        """Five folds means a kind with 17 examples reports on three per fold.

        The corpus cannot produce more -- only 17 claim-sentences name a
        service -- so the kind is neither dropped (it is real signal) nor
        silently included (three examples is not a measurement). It is
        DECLARED, and this asserts the declaration matches reality: a kind that
        becomes thin without being listed fails here.
        """
        from collections import Counter

        counts = Counter(p.kind for p in ed.build_entailment_pairs() if p.kind in self.HARD)
        thin = {k for k, n in counts.items() if n < 20}
        self.assertEqual(
            thin,
            set(ed.THIN_KINDS),
            f"thin kinds are {thin} but THIN_KINDS declares {set(ed.THIN_KINDS)}",
        )

    def test_the_hard_kinds_constant_matches_what_the_builder_produces(self) -> None:
        produced = {p.kind for p in ed.build_entailment_pairs()}
        self.assertTrue(
            ed.HARD_KINDS <= produced, f"declared but never built: {ed.HARD_KINDS - produced}"
        )


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
