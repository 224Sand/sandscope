"""The published dataset inventory must describe the corpus that exists (FR-031).

`apps/web/src/generated/dataset.json` is committed because the web build has no
Python, and a committed file derived from code is the exact shape this project
keeps getting wrong: D-014, D-019 and D-020 were all a stored claim that drifted
from what it described, and each was found by a person rather than a check.

So the file is regenerated here and compared. If the corpus gains a document, a
service is added, or a question generator changes, this fails and the fix is to
re-run the exporter — not to edit the JSON.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUMMARY = ROOT.parent / "web" / "src" / "generated" / "dataset.json"


def _regenerate() -> dict:
    """Run the exporter into a scratch location and read what it produced."""
    original = SUMMARY.read_text() if SUMMARY.exists() else None
    try:
        subprocess.run(
            [sys.executable, "training/export_dataset_summary.py"],
            cwd=ROOT,
            check=True,
            capture_output=True,
        )
        return json.loads(SUMMARY.read_text())
    finally:
        # Leave the working tree exactly as found: a test that rewrites a
        # committed file makes `git status` lie about what the developer did.
        if original is not None:
            SUMMARY.write_text(original)


class TestDatasetSummaryIsCurrent:
    def test_the_committed_summary_matches_the_corpus_that_exists(self) -> None:
        committed = json.loads(SUMMARY.read_text())
        assert committed == _regenerate(), (
            "dataset.json no longer describes this corpus. Re-run "
            "`python training/export_dataset_summary.py` rather than editing the file."
        )

    def test_it_counts_the_documents_actually_on_disk(self) -> None:
        """Belt and braces. If the exporter and the test both read the same
        wrong source, the comparison above passes while the number is wrong."""
        committed = json.loads(SUMMARY.read_text())
        on_disk = len(list((ROOT / "corpus").rglob("*.md")))
        # GAPS.md sits in the corpus directory but is not a retrievable
        # document -- it is the list of what the corpus deliberately omits.
        assert committed["corpus"]["documents"] == on_disk - 1

    def test_every_mechanism_carries_an_example_and_an_explanation(self) -> None:
        """A published inventory that names a generation mechanism without
        showing one is asking to be taken on trust, which is the opposite of
        what this surface is for."""
        for mechanism in json.loads(SUMMARY.read_text())["questions"]["mechanisms"]:
            assert mechanism["example"], f"{mechanism['id']} has no example question"
            assert len(mechanism["note"]) > 40, f"{mechanism['id']} has no real explanation"

    def test_the_answerable_split_adds_up(self) -> None:
        q = json.loads(SUMMARY.read_text())["questions"]
        assert q["answerable"] + q["unanswerable"] == q["total"]
        assert sum(m["count"] for m in q["mechanisms"]) == q["total"]
