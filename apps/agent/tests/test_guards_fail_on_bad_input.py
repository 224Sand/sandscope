"""Every guard must be observed failing on the defect it claims to catch.

Definition of Done item 9, made automatic. It was a habit before, and habits are
what produced D-013 (a pen test that passed while the service was down) and
D-015 (a README checker that passed on a value deliberately corrupted to break
it). Both were guards that had only ever been run against a passing tree.

Each test below builds a fixture containing exactly one known defect, runs the
real guard against it, and asserts a NON-ZERO exit. A guard that passes here has
failed: it means it cannot see the thing it exists to see.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPTS = ROOT / "scripts"
NODE = shutil.which("node")
GIT = shutil.which("git")


def run(script: str, *args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    # Every argument is a literal in this file or a temp path this file created;
    # nothing here comes from input. Resolved absolute paths, not bare names.
    return subprocess.run(  # noqa: S603
        [str(NODE), str(SCRIPTS / script), *args],
        capture_output=True,
        text=True,
        cwd=str(cwd) if cwd else None,
        check=False,
    )


@unittest.skipIf(NODE is None or GIT is None, "node and git are required")
class GuardsFailOnKnownBadInput(unittest.TestCase):
    def assertGuardFails(self, result: subprocess.CompletedProcess[str], expect: str) -> None:
        self.assertNotEqual(
            result.returncode,
            0,
            "the guard passed on input containing the defect it exists to catch; "
            f"stdout={result.stdout!r}",
        )
        self.assertIn(expect, result.stdout + result.stderr)

    def test_sprint_guard_catches_a_number_used_before_its_plan(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            gov = Path(tmp) / "docs/00-governance"
            gov.mkdir(parents=True)
            (gov / "SPRINT_00_PLAN.md").write_text("# Sprint 0\n")
            # Sprint 4 referenced, never planned.
            (Path(tmp) / "docs/NOTES.md").write_text("A defect found in Sprint 4.\n")
            self.assertGuardFails(run("check-sprints.mjs", tmp), "Sprint 4")

    def test_sprint_guard_catches_a_review_without_a_plan(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            gov = Path(tmp) / "docs/00-governance"
            gov.mkdir(parents=True)
            (gov / "SPRINT_00_PLAN.md").write_text("# Sprint 0\n")
            (gov / "SPRINT_01_REVIEW.md").write_text("# Sprint 1 review\n")
            self.assertGuardFails(run("check-sprints.mjs", tmp), "closed without being opened")

    def test_traceability_guard_catches_done_without_a_test(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            req = Path(tmp) / "docs/01-requirements"
            req.mkdir(parents=True)
            (req / "TRACEABILITY.md").write_text(
                "| ID | Need | Story | Test | Sprint | Status |\n"
                "|---|---|---|---|---|---|\n"
                "| XX-001 | a thing | S0-01 | `test_that_does_not_exist_anywhere_at_all` | 0 | Done |\n"
            )
            subprocess.run([str(GIT), "init", "-q", tmp], check=True)  # noqa: S603
            self.assertGuardFails(run("check-traceability.mjs", tmp), "XX-001")

    def test_traceability_guard_catches_a_status_outside_the_legend(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            req = Path(tmp) / "docs/01-requirements"
            req.mkdir(parents=True)
            (req / "TRACEABILITY.md").write_text(
                "| ID | Need | Story | Test | Sprint | Status |\n"
                "|---|---|---|---|---|---|\n"
                "| XX-002 | a thing | S0-01 | `whatever` | 0 | Done (design) |\n"
            )
            subprocess.run([str(GIT), "init", "-q", tmp], check=True)  # noqa: S603
            self.assertGuardFails(run("check-traceability.mjs", tmp), "Done (design)")

    def test_traceability_guard_catches_planned_with_a_test_that_exists(self) -> None:
        """D-020, in the direction nothing checked.

        A row sitting at Planned while the test it names already exists is how
        20 finished requirements stayed invisible for months. The guard caught
        the opposite mistake from the day it was written; this is the half that
        let the public delivery page under-report the work.
        """
        with tempfile.TemporaryDirectory() as tmp:
            reqs = Path(tmp) / "docs/01-requirements"
            reqs.mkdir(parents=True)
            (reqs / "TRACEABILITY.md").write_text(
                "| ID | Requirement | Story | Test | Sprint | Status |\n"
                "|---|---|---|---|---|---|\n"
                "| FR-999 | A thing already built | S1 | `test_a_thing_that_exists` "
                "| 1 | Planned |\n"
            )
            tests = Path(tmp) / "apps/agent/tests"
            tests.mkdir(parents=True)
            (tests / "test_real.py").write_text(
                "def test_a_thing_that_exists() -> None:\n    assert True\n"
            )
            # The guard builds its corpus from `git ls-files`, so an untracked
            # fixture is invisible to it and the test would pass for the wrong
            # reason.
            subprocess.run([str(GIT), "init", "-q"], cwd=tmp, check=True)  # noqa: S603
            subprocess.run([str(GIT), "add", "-A"], cwd=tmp, check=True)  # noqa: S603

            self.assertGuardFails(run("check-traceability.mjs", tmp), "FR-999")

    def test_readme_guard_catches_a_drifted_figure(self) -> None:
        """The D-015 regression, asserted rather than remembered."""
        with tempfile.TemporaryDirectory() as tmp:
            dst = Path(tmp)
            (dst / "apps/web/src/generated").mkdir(parents=True)
            for name in ("delivery.json", "reliability.json", "architecture.json"):
                shutil.copy(
                    ROOT / "apps/web/src/generated" / name, dst / "apps/web/src/generated" / name
                )
            derived = json.loads((dst / "apps/web/src/generated/delivery.json").read_text())
            wrong = derived["defects"]["total"] + 7
            readme = (
                (ROOT / "README.md")
                .read_text()
                .replace(
                    f"| Defects logged | {derived['defects']['total']}, of which",
                    f"| Defects logged | {wrong}, of which",
                    1,
                )
            )
            (dst / "README.md").write_text(readme)
            self.assertGuardFails(run("check-readme.mjs", str(dst)), "defects")

    def test_deploy_claims_guard_catches_a_stale_undeployed_claim(self) -> None:
        """The D-019 regression: PROJECT_RECORD.html and SPRINT_08_PLAN.md both
        asserted the web app was undeployed and Sprint 8 was blocked on
        credentials for a full week after the real deploy landed. Caught only
        because the user quoted the stale text back and asked "true?" -- not by
        any guard, because none existed yet."""
        with tempfile.TemporaryDirectory() as tmp:
            dst = Path(tmp)
            (dst / "docs/00-governance").mkdir(parents=True)
            shutil.copy(ROOT / "product.config.json", dst / "product.config.json")
            (dst / "docs/00-governance/FAKE.md").write_text(
                "The web application is not deployed. No Vercel project exists.\n"
            )
            self.assertGuardFails(run("check-deploy-claims.mjs", str(dst)), "stale")

    def test_workflow_guard_catches_a_comment_inside_a_continuation(self) -> None:
        """The D-011 regression."""
        with tempfile.TemporaryDirectory() as tmp:
            wf = Path(tmp) / ".github/workflows"
            wf.mkdir(parents=True)
            (wf / "x.yml").write_text(
                "jobs:\n"
                "  a:\n"
                "    steps:\n"
                "      - run: |\n"
                "          echo one \\\n"
                "          # this comment ends the command\n"
                "          --flag-that-becomes-a-command\n"
            )
            self.assertGuardFails(
                run("check-workflow-shell.mjs", cwd=Path(tmp)), "comment inside a backslash"
            )

    def test_secret_scan_catches_a_credential_in_a_committed_file(self) -> None:
        """DoD item 4. A scanner that has never seen a secret has never been
        tested against one, and this is the guard whose failure is least
        recoverable: a leaked key is public the moment the push lands."""
        with tempfile.TemporaryDirectory() as tmp:
            planted = Path(tmp) / "apps/web/src/lib/leak.ts"
            planted.parent.mkdir(parents=True)
            # Assembled from fragments for exactly the reason check-secrets.mjs
            # assembles its own patterns: this file is itself one of the
            # committable files the scanner reads, so a fixture written as a
            # literal would fail the repository's secret gate on every run.
            planted_credential = "sk" + "-live-0123456789abcdef0123456789abcdef"
            planted.write_text(f'export const KEY = "{planted_credential}";\n')
            subprocess.run([str(GIT), "init", "-q"], cwd=tmp, check=True)  # noqa: S603
            subprocess.run([str(GIT), "add", "-A"], cwd=tmp, check=True)  # noqa: S603

            self.assertGuardFails(run("check-secrets.mjs", tmp), "leak.ts")

    def test_config_guard_catches_a_slug_that_does_not_derive(self) -> None:
        """FR-001. The product name is authored in exactly one place and the
        slug is derived from it; a hand-edited slug that disagrees is how a
        rename half-lands."""
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "product.config.json").write_text(
                json.dumps(
                    {
                        "name": "SandScope",
                        "slug": "something-else",
                        "wordmark": "SANDSCOPE",
                        "repo": "224Sand/sandscope",
                    }
                )
            )
            self.assertGuardFails(run("check-config.mjs", tmp), "slug")

    def test_docs_guard_catches_a_requirement_with_no_test(self) -> None:
        """Charter section 11: a requirement with no test is a defect in the
        process. The guard must refuse an EMPTY Test cell, not only a wrong
        one."""
        with tempfile.TemporaryDirectory() as tmp:
            reqs = Path(tmp) / "docs/01-requirements"
            reqs.mkdir(parents=True)
            (reqs / "TRACEABILITY.md").write_text(
                "| ID | Requirement | Story | Test | Sprint | Status |\n"
                "|---|---|---|---|---|---|\n"
                "| FR-998 | A thing with no test | S1 |  | 1 | Planned |\n"
            )
            self.assertGuardFails(run("check-docs.mjs", tmp), "FR-998")


if __name__ == "__main__":
    unittest.main()
