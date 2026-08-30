"""Drafting a postmortem from a completed run (FR-009).

The point of writing a postmortem FROM a run rather than from memory is that it
cannot quietly acquire facts the run never established. A prompt can ask for
that; only a check can guarantee it, and the difference matters because the
failure is invisible — a postmortem citing a passage the run never retrieved
reads exactly like one citing a passage it did.

So the model drafts, and then every citation is checked against the set of
chunks the original run actually resolved. Anything outside that set is not
dropped silently: it is marked unresolved and kept, for the same reason
`orchestrator/citations.py` keeps fabricated markers rather than deleting them.
A citation that disappears cannot be reviewed, and "the draft cited something
the run never found" is a fact about the draft worth surfacing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class EvidenceScope:
    """What a completed run actually established.

    Built from the run's stored citations rather than from its prose, because
    the prose is what is being checked.
    """

    run_id: str
    subject: str
    hypothesis: str
    #: Chunk ids the original run cited AND resolved. A run's unresolved
    #: citations are excluded on purpose: they were never evidence, and a
    #: postmortem inheriting them would launder a fabricated marker into a
    #: permanent record.
    chunk_ids: frozenset[str]

    @property
    def is_empty(self) -> bool:
        return not self.chunk_ids


def scope_from_run(run_id: str, state: dict[str, Any]) -> EvidenceScope:
    """The evidence a completed run is entitled to be written up from."""
    citations = state.get("citations") or []
    return EvidenceScope(
        run_id=run_id,
        subject=str(state.get("subject", "")),
        hypothesis=str(state.get("hypothesis") or ""),
        chunk_ids=frozenset(
            str(c["chunk_id"]) for c in citations if c.get("resolved") and c.get("chunk_id")
        ),
    )


def restrict_to_run_evidence(
    citations: list[dict[str, Any]],
    scope: EvidenceScope,
) -> list[dict[str, Any]]:
    """Mark any citation the original run did not establish as unresolved.

    Not a filter. Removing the offending citations would leave a draft that
    looks perfectly grounded and is missing the sentences that were not — which
    is the same shape as a model putting one marker at the end of six sentences
    and calling five of them cited.
    """
    restricted: list[dict[str, Any]] = []
    for citation in citations:
        chunk_id = citation.get("chunk_id")
        within_scope = bool(chunk_id) and str(chunk_id) in scope.chunk_ids
        restricted.append(
            {
                **citation,
                "resolved": bool(citation.get("resolved")) and within_scope,
                **(
                    {}
                    if within_scope
                    else {
                        "out_of_scope": True,
                        "reason": (
                            f"run {scope.run_id} never resolved this passage; a postmortem "
                            "may only cite what its run established"
                        ),
                    }
                ),
            }
        )
    return restricted


def out_of_scope(citations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The citations a draft made that its run does not support."""
    return [c for c in citations if c.get("out_of_scope")]
