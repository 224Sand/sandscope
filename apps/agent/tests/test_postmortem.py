"""FR-009 — drafting a postmortem from a completed run.

The property under test is the one that makes writing a postmortem FROM a run
worth doing at all: it cannot acquire facts the run never established. A prompt
can request that; only a check enforces it, and the failure is invisible
without one — a postmortem citing a passage the run never retrieved reads
exactly like one citing a passage it did.
"""

from __future__ import annotations

from sandscope_agent.orchestrator.postmortem import (
    out_of_scope,
    restrict_to_run_evidence,
    scope_from_run,
)
from sandscope_agent.orchestrator.workloads import RiskLevel, WorkloadInput, get_workload

COMPLETED_RUN = {
    "subject": "inc-4471",
    "status": "completed",
    "hypothesis": "[1] Pool wait time rose before query time, which points at the pool.",
    "citations": [
        {
            "claim_text": "Pool wait time rose before query time.",
            "chunk_id": "rb-database-connection-pool#00",
            "score": 0.91,
            "resolved": True,
        },
        {
            "claim_text": "Available connections reached zero.",
            "chunk_id": "inc-2026-06-11-orders-db#02",
            "score": 0.84,
            "resolved": True,
        },
        {
            # Never established. A run keeps its fabricated markers rather than
            # deleting them, and a postmortem must not inherit one as evidence.
            "claim_text": "The cache was cold at the time.",
            "chunk_id": None,
            "score": 0.0,
            "resolved": False,
        },
    ],
}


class TestEvidenceScope:
    def test_the_scope_is_what_the_run_actually_resolved(self) -> None:
        scope = scope_from_run("run-1", COMPLETED_RUN)
        assert scope.chunk_ids == {
            "rb-database-connection-pool#00",
            "inc-2026-06-11-orders-db#02",
        }

    def test_an_unresolved_citation_is_not_inherited_as_evidence(self) -> None:
        """Otherwise a fabricated marker in the run is laundered into a
        permanent record by the document written from it."""
        scope = scope_from_run("run-1", COMPLETED_RUN)
        assert None not in scope.chunk_ids
        assert len(scope.chunk_ids) == 2

    def test_a_run_that_established_nothing_has_an_empty_scope(self) -> None:
        scope = scope_from_run("run-2", {"status": "refused", "citations": []})
        assert scope.is_empty

    def test_the_hypothesis_travels_with_the_scope(self) -> None:
        assert "Pool wait time rose" in scope_from_run("run-1", COMPLETED_RUN).hypothesis


class TestPostmortemCitesOnlyRunEvidence:
    """The requirement, asserted directly."""

    SCOPE = scope_from_run("run-1", COMPLETED_RUN)

    def test_a_citation_the_run_established_survives(self) -> None:
        drafted = [
            {
                "claim_text": "Wait time rose first.",
                "chunk_id": "rb-database-connection-pool#00",
                "resolved": True,
            }
        ]
        [result] = restrict_to_run_evidence(drafted, self.SCOPE)
        assert result["resolved"] is True
        assert "out_of_scope" not in result

    def test_a_citation_the_run_never_made_is_marked_unresolved(self) -> None:
        """The draft reached for a real passage from the corpus that this run
        never retrieved. Plausible, checkable, and not something the run
        established."""
        drafted = [
            {
                "claim_text": "The failover procedure requires a manual step.",
                "chunk_id": "rb-disaster-recovery#03",
                "resolved": True,
            }
        ]
        [result] = restrict_to_run_evidence(drafted, self.SCOPE)
        assert result["resolved"] is False
        assert result["out_of_scope"] is True
        assert "never resolved this passage" in result["reason"]

    def test_an_out_of_scope_citation_is_kept_rather_than_deleted(self) -> None:
        """Dropping it would leave a draft that looks perfectly grounded and is
        missing the sentence that was not — the same shape as one marker at the
        end of six sentences calling five of them cited."""
        drafted = [
            {"claim_text": "a", "chunk_id": "rb-database-connection-pool#00", "resolved": True},
            {"claim_text": "b", "chunk_id": "rb-disaster-recovery#03", "resolved": True},
        ]
        result = restrict_to_run_evidence(drafted, self.SCOPE)
        assert len(result) == 2, "a citation disappeared and cannot be reviewed"
        assert [c["claim_text"] for c in result] == ["a", "b"]

    def test_out_of_scope_reports_exactly_what_the_run_does_not_support(self) -> None:
        drafted = [
            {"claim_text": "a", "chunk_id": "rb-database-connection-pool#00", "resolved": True},
            {"claim_text": "b", "chunk_id": "rb-disaster-recovery#03", "resolved": True},
            {"claim_text": "c", "chunk_id": "inc-2026-06-11-orders-db#02", "resolved": True},
        ]
        offenders = out_of_scope(restrict_to_run_evidence(drafted, self.SCOPE))
        assert [c["claim_text"] for c in offenders] == ["b"]

    def test_a_citation_with_no_chunk_at_all_cannot_pass(self) -> None:
        drafted = [{"claim_text": "invented", "chunk_id": None, "resolved": True}]
        [result] = restrict_to_run_evidence(drafted, self.SCOPE)
        assert result["resolved"] is False

    def test_nothing_survives_a_run_that_established_nothing(self) -> None:
        """A refused run supports no postmortem claims whatsoever. If anything
        passed here, the scope check would be decorative on exactly the runs
        where it matters most."""
        empty = scope_from_run("run-2", {"citations": []})
        drafted = [
            {"claim_text": "a", "chunk_id": "rb-database-connection-pool#00", "resolved": True}
        ]
        assert restrict_to_run_evidence(drafted, empty)[0]["resolved"] is False


class TestPostmortemWorkload:
    def test_it_is_registered_alongside_the_others(self) -> None:
        assert get_workload("postmortem").name == "postmortem"

    def test_it_runs_on_the_same_graph_as_every_other_workload(self) -> None:
        """A bespoke path for the third workload would disprove the
        workload-agnosticism the first two exist to demonstrate."""
        from sandscope_agent.orchestrator.budget import SpendGuard
        from sandscope_agent.orchestrator.graph import Dependencies, build_graph
        from sandscope_agent.retrieval.corpus import chunk_corpus, load_corpus
        from sandscope_agent.retrieval.embedding import HashingEmbedder
        from sandscope_agent.retrieval.hybrid import HybridRetriever
        from sandscope_agent.router.providers import StubProvider
        from sandscope_agent.router.router import Router
        from sandscope_agent.router.state import ManualClock, RouterState

        retriever = HybridRetriever(chunks=chunk_corpus(load_corpus()), embedder=HashingEmbedder())
        retriever.build_vectors()
        guard = SpendGuard()
        guard.open(1.0)
        deps = Dependencies(
            retriever=retriever,
            router=Router(
                providers=[StubProvider("stub", default="[1] A cited claim.")],
                state=RouterState(),
                clock=ManualClock(),
                environment="test",
            ),
            guard=guard,
        )
        topology = build_graph(deps).get_graph()
        assert topology is not None

    def test_a_postmortem_is_never_gated_for_describing_an_action(self) -> None:
        """`_base_risk` matches destructive verbs in the proposal text, and an
        accurate postmortem says "the pool was restarted". Escalating a
        write-up to HIGH for correctly reporting a restart that already
        happened would make the risk gate look arbitrary and teach reviewers to
        click through it. The action was gated when it was proposed."""
        workload = get_workload("postmortem")
        level, reason = workload.score_risk(
            "The orders-db connection pool was restarted on the Tier 0 path.",
            WorkloadInput(subject="inc-4471", body="", context={"tier": "0"}),
        )
        assert level is RiskLevel.LOW
        assert not level.requires_approval
        assert "proposes no action" in reason

    def test_the_same_words_in_a_triage_proposal_DO_gate(self) -> None:
        """The contrast is the point: this is a postmortem exemption, not a
        hole in the risk gate.

        Phrased in the imperative, which is how a triage proposal is actually
        written. The first version of this test used the past tense a
        postmortem would use ("was restarted") and got MEDIUM, not HIGH —
        because `_DESTRUCTIVE` matches `\brestart\b`, and "restarted" fails
        that word boundary. Worth knowing and correct for the real use: a
        proposal says what to DO, so it is imperative; only a postmortem
        narrates in the past. A postmortem quoting a runbook in the present
        tense ("the runbook says to restart the pool") WOULD match, which is
        exactly why the exemption above is a design decision rather than a
        redundancy."""
        level, _ = get_workload("incident_triage").score_risk(
            "Restart the orders-db connection pool on the Tier 0 path.",
            WorkloadInput(subject="inc-4471", body="", context={"tier": "0"}),
        )
        assert level.requires_approval

    def test_a_postmortem_quoting_a_runbook_in_the_present_tense_is_still_low(self) -> None:
        """The case that makes the exemption load-bearing rather than
        decorative: this phrasing DOES match the destructive-verb regex."""
        level, _ = get_workload("postmortem").score_risk(
            "The runbook says to restart the pool; that is what was done.",
            WorkloadInput(subject="inc-4471", body="", context={"tier": "0"}),
        )
        assert not level.requires_approval

    def test_it_asks_for_a_record_rather_than_a_remediation(self) -> None:
        prompt = get_workload("postmortem").system_prompt()
        assert "do not recommend actions" in prompt.lower()
        assert "only the evidence provided" in prompt.lower()
