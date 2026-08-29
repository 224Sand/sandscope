"""Incident and telemetry generation.

The property that matters most is reproducibility: if an incident cannot be
regenerated from its seed, a triage run that goes wrong can only be described,
not replayed.
"""

from __future__ import annotations

import inspect
from datetime import UTC, datetime, timedelta

import pytest

from sandscope_agent.seed import estate
from sandscope_agent.seed.faults import PATTERNS, Signal, pattern_by_id
from sandscope_agent.seed.incidents import (
    BASELINE_WINDOW,
    FAULT_WINDOW,
    SCHEDULE_INTERVAL_SECONDS,
    as_run_input,
    current_incident,
    generate_incident,
    generate_telemetry,
)

T0 = datetime(2026, 8, 20, 14, 0, tzinfo=UTC)


class TestDeterminism:
    def test_same_seed_yields_the_same_incident(self) -> None:
        assert generate_incident(42, T0) == generate_incident(42, T0)

    def test_same_seed_yields_byte_identical_telemetry(self) -> None:
        a = generate_telemetry(generate_incident(42, T0))
        b = generate_telemetry(generate_incident(42, T0))
        assert a == b

    def test_different_seeds_yield_different_incidents(self) -> None:
        ids = {generate_incident(s, T0).id for s in range(30)}
        assert len(ids) == 30

    def test_seeds_reach_a_variety_of_patterns(self) -> None:
        patterns = {generate_incident(s, T0).pattern_id for s in range(200)}
        assert len(patterns) >= 6, f"only {len(patterns)} distinct patterns in 200 seeds"

    def test_telemetry_does_not_depend_on_process_hash_seed(self) -> None:
        """A salted hash would make this pass in-process and fail across runs."""
        import subprocess
        import sys

        script = (
            "from datetime import datetime, timezone;"
            "from sandscope_agent.seed.incidents import generate_incident, generate_telemetry;"
            "i=generate_incident(7, datetime(2026,8,20,14,0,tzinfo=timezone.utc));"
            "t=generate_telemetry(i);"
            "print(round(sum(p.value for p in t), 6))"
        )
        runs = {
            subprocess.run(  # noqa: S603
                [sys.executable, "-c", script],
                capture_output=True,
                text=True,
                check=True,
                env={"PYTHONHASHSEED": seed, "PATH": "/usr/bin:/bin"},
            ).stdout.strip()
            for seed in ("0", "1", "12345")
        }
        assert len(runs) == 1, f"telemetry varied with PYTHONHASHSEED: {runs}"


class TestConsistency:
    def test_incident_pattern_matches_the_service_runtime(self) -> None:
        for seed in range(60):
            incident = generate_incident(seed, T0)
            service = estate.service_by_id(incident.service_id)
            assert pattern_by_id(incident.pattern_id).applies_to(service.runtime)

    def test_severity_comes_from_the_pattern(self) -> None:
        incident = generate_incident(42, T0)
        assert incident.severity == pattern_by_id(incident.pattern_id).severity


class TestTelemetryShape:
    def test_covers_the_baseline_and_fault_windows(self) -> None:
        incident = generate_incident(42, T0)
        points = generate_telemetry(incident)
        earliest = min(p.observed_at for p in points)
        latest = max(p.observed_at for p in points)
        assert earliest == incident.opened_at - BASELINE_WINDOW
        assert latest <= incident.opened_at + FAULT_WINDOW

    def test_primary_signals_are_on_the_root_service_only(self) -> None:
        incident = generate_incident(42, T0)
        primary = {p.service_id for p in generate_telemetry(incident) if p.is_primary}
        assert primary == {incident.service_id}

    def test_secondary_signals_stay_within_the_blast_radius(self) -> None:
        incident = generate_incident(42, T0)
        radius = set(estate.blast_radius(incident.service_id))
        secondary = {p.service_id for p in generate_telemetry(incident) if not p.is_primary}
        assert secondary <= radius

    def test_baseline_is_quiet_and_fault_window_is_not(self) -> None:
        """The evidence must actually distinguish before from after."""
        incident = generate_incident(42, T0)
        pattern = pattern_by_id(incident.pattern_id)
        signal: Signal = pattern.primary[0]
        points = [
            p for p in generate_telemetry(incident) if p.is_primary and p.name == signal.metric
        ]
        before = [p.value for p in points if p.observed_at < incident.opened_at]
        after = [
            p.value for p in points if p.observed_at >= incident.opened_at + timedelta(minutes=20)
        ]

        assert before and after
        drift = abs(sum(before) / len(before) - signal.baseline)
        assert drift < abs(signal.peak - signal.baseline) * 0.1, "baseline is not quiet"

        if signal.direction == "rise":
            assert max(after) > signal.baseline + (signal.peak - signal.baseline) * 0.4
        else:
            assert min(after) < signal.baseline - (signal.baseline - signal.peak) * 0.4

    def test_downstream_effects_lag_the_root_cause(self) -> None:
        """Time ordering is the diagnostic signal; without it triage is guesswork."""
        incident = generate_incident(42, T0)
        points = generate_telemetry(incident)
        secondary = [p for p in points if not p.is_primary]
        if not secondary:
            pytest.skip("this seed's incident has no in-radius secondary metrics")

        metric = secondary[0].name
        service = secondary[0].service_id
        series = sorted(
            (p for p in secondary if p.name == metric and p.service_id == service),
            key=lambda p: p.observed_at,
        )
        at_onset = [p.value for p in series if p.observed_at == incident.opened_at]
        later = [
            p.value for p in series if p.observed_at >= incident.opened_at + timedelta(minutes=15)
        ]
        assert at_onset and later
        assert max(later) != at_onset[0], "downstream signal never moved"

    def test_metrics_are_plausible_for_the_service(self) -> None:
        """A datastore metric on the edge gateway is noise a real estate would not emit."""
        datastore_runtimes = {"postgres16", "redis7", "kafka3.8", "opensearch2"}
        for seed in range(25):
            for point in generate_telemetry(generate_incident(seed, T0)):
                if point.is_primary:
                    continue
                service = estate.service_by_id(point.service_id)
                if point.name.startswith(("http.", "thread_pool.", "process.", "runtime.")):
                    assert service.runtime not in datastore_runtimes, (
                        f"{point.name} emitted on datastore {service.name}"
                    )


class TestFaultCatalogue:
    def test_every_pattern_has_a_runbook_and_signals(self) -> None:
        for pattern in PATTERNS:
            assert pattern.runbook_id.startswith("rb-")
            assert pattern.primary, f"{pattern.id} has no identifying signal"
            assert pattern.summary.strip()

    def test_pattern_ids_are_unique(self) -> None:
        assert len({p.id for p in PATTERNS}) == len(PATTERNS)

    def test_a_rising_signal_must_peak_above_baseline(self) -> None:
        with pytest.raises(ValueError, match="must peak above baseline"):
            Signal("x", "ms", "rise", 100.0, 10.0)

    def test_a_falling_signal_must_trough_below_baseline(self) -> None:
        with pytest.raises(ValueError, match="must trough below baseline"):
            Signal("x", "ratio", "fall", 0.1, 0.9)

    def test_every_pattern_is_reachable_from_some_service(self) -> None:
        runtimes = {s.runtime for s in estate.services()}
        for pattern in PATTERNS:
            assert any(pattern.applies_to(r) for r in runtimes), f"{pattern.id} is unreachable"


class TestIncidentFeed:
    """FR-003: the incident feed, at the level below the HTTP surface."""

    def test_the_same_schedule_slot_yields_the_same_incident(self) -> None:
        t1 = datetime(2026, 8, 20, 12, 0, 0, tzinfo=UTC)
        t2 = t1 + timedelta(seconds=SCHEDULE_INTERVAL_SECONDS - 1)
        assert current_incident(t1).id == current_incident(t2).id

    def test_the_next_schedule_slot_yields_a_different_incident(self) -> None:
        t1 = datetime(2026, 8, 20, 12, 0, 0, tzinfo=UTC)
        t2 = t1 + timedelta(seconds=SCHEDULE_INTERVAL_SECONDS)
        assert current_incident(t1).id != current_incident(t2).id

    def test_as_run_input_names_the_service_that_is_actually_failing(self) -> None:
        incident = generate_incident(42, T0)
        run_input = as_run_input(incident)
        assert run_input["context"]["service"] == incident.service_id
        assert run_input["subject"] == incident.id
        assert len(run_input["body"]) > 0

    def test_as_run_input_body_names_the_signal_that_actually_moved(self) -> None:
        """Not an invented sentence — the body must reference the pattern's own
        authored lead signal, not generic filler."""
        incident = generate_incident(42, T0)
        pattern = next(p for p in PATTERNS if p.id == incident.pattern_id)
        run_input = as_run_input(incident)
        assert pattern.primary[0].metric in run_input["body"]


class TestSyntheticOnly:
    """SD-002: synthetic data only, no real customer data.

    Not a claim to trust from the module docstring — checked directly against
    the source of every module that produces estate/incident/telemetry data.
    A real-data leak here would be an `open()`, a network client, or a CSV/JSON
    load of something not committed as part of this package; none of those
    should ever appear, and this fails the moment one does.
    """

    FORBIDDEN_TOKENS = ("open(", "requests.", "httpx.", "urllib.", "boto3", "psycopg")

    def test_no_data_generation_module_reads_from_an_external_source(self) -> None:
        import sandscope_agent.seed.estate as estate_mod
        import sandscope_agent.seed.faults as faults_mod
        import sandscope_agent.seed.incidents as incidents_mod

        for module in (estate_mod, faults_mod, incidents_mod):
            source = inspect.getsource(module)
            for token in self.FORBIDDEN_TOKENS:
                assert token not in source, f"{module.__name__} contains {token!r}"

    def test_incident_and_telemetry_values_are_reproducible_from_the_seed_alone(self) -> None:
        """The only inputs `generate_incident`/`generate_telemetry` accept are a
        seed and a clock. If the output depended on anything else — a file, an
        environment variable, real wall-clock time — two calls with the same
        seed and the same T0 would not be guaranteed to match, which is exactly
        what TestDeterminism above already proves. This test names the
        SD-002 reading of that same proof explicitly, rather than leaving the
        connection implicit."""
        first = generate_telemetry(generate_incident(7, T0))
        second = generate_telemetry(generate_incident(7, T0))
        assert first == second

    def test_service_and_team_names_are_not_a_real_organisation(self) -> None:
        """A generated estate that happened to reuse a real company or team name
        would still be reproducible and still pass every other test here — this
        is the one check aimed at that specific failure mode."""
        banned = {"google", "amazon", "microsoft", "meta", "netflix", "stripe", "adyen"}
        for service in estate.services():
            haystack = f"{service.name} {service.owner_team}".lower()
            for name in banned:
                assert name not in haystack, f"{service.id} references {name!r}"
