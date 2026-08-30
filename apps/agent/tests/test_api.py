"""The agent runtime's HTTP surface.

The runtime is publicly reachable and the BFF is its only legitimate client, so
the tests that matter here are about what it REFUSES: unauthenticated requests,
unknown workloads, and its own misconfiguration.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sandscope_agent.api.security import TokenNotConfiguredError, expected_token

PACKAGE_ROOT = Path(__file__).resolve().parent.parent / "sandscope_agent"

TOKEN = "t" * 48


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """Context-managed, so FastAPI's lifespan actually runs.

    A bare TestClient(app) skips startup entirely, so the corpus never loads and
    every route that needs it fails for a reason that has nothing to do with the
    code under test.
    """
    monkeypatch.setenv("AGENT_SERVICE_TOKEN", TOKEN)
    monkeypatch.setenv("SANDSCOPE_ENV", "test")
    monkeypatch.setenv("RUN_BUDGET_USD", "0.02")
    import importlib

    from sandscope_agent.api import app as module

    importlib.reload(module)
    with TestClient(module.app) as test_client:
        yield test_client


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}


class TestStartupRefusesBadConfiguration:
    """A service that starts in a state where every request fails is worse than
    one that refuses to start. The failure surfaces at request time, once per
    user, as a stack trace."""

    def test_a_zero_budget_prevents_startup(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """RUN_BUDGET_USD=0 is the spend guard's 'cannot spend' state. It is the
        correct DEFAULT and an unusable RUNTIME value: every run died mid-stream
        with an unhandled BudgetError before this check existed."""
        monkeypatch.setenv("AGENT_SERVICE_TOKEN", TOKEN)
        monkeypatch.setenv("RUN_BUDGET_USD", "0")
        import importlib

        from sandscope_agent.api import app as module

        importlib.reload(module)
        with pytest.raises(RuntimeError, match="RUN_BUDGET_USD"), TestClient(module.app):
            pass

    def test_a_negative_budget_prevents_startup(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("AGENT_SERVICE_TOKEN", TOKEN)
        monkeypatch.setenv("RUN_BUDGET_USD", "-1")
        import importlib

        from sandscope_agent.api import app as module

        importlib.reload(module)
        with pytest.raises(RuntimeError, match="RUN_BUDGET_USD"), TestClient(module.app):
            pass

    def test_a_missing_token_is_rejected_at_the_boundary(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Refusing is the only safe response. A service that falls back to
        'no auth required' when its secret is missing is one deploy from open."""
        monkeypatch.delenv("AGENT_SERVICE_TOKEN", raising=False)
        with pytest.raises(TokenNotConfiguredError, match="refuses to serve"):
            expected_token()

    def test_a_short_token_is_rejected(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("AGENT_SERVICE_TOKEN", "short")
        with pytest.raises(TokenNotConfiguredError, match="at least 32"):
            expected_token()


class TestAuthentication:
    def test_health_is_open(self, client: TestClient) -> None:
        """The warm-ping cron needs it and it reveals nothing."""
        response = client.get("/healthz")
        assert response.status_code == 200
        assert response.json()["corpus_ready"] is True

    def test_no_token_is_rejected(self, client: TestClient) -> None:
        assert client.get("/v1/providers").status_code == 401

    def test_a_wrong_token_is_rejected(self, client: TestClient) -> None:
        assert (
            client.get("/v1/providers", headers={"Authorization": "Bearer wrong"}).status_code
            == 401
        )

    def test_the_wrong_scheme_is_rejected(self, client: TestClient) -> None:
        assert (
            client.get("/v1/providers", headers={"Authorization": f"Basic {TOKEN}"}).status_code
            == 401
        )

    def test_a_valid_token_is_accepted(self, client: TestClient) -> None:
        assert client.get("/v1/providers", headers=auth()).status_code == 200

    def test_comparison_is_constant_time(self) -> None:
        """A token checked with == leaks its length and then its content through
        response timing, one byte at a time."""
        import ast
        import inspect

        from sandscope_agent.api import security

        tree = ast.parse(inspect.getsource(security))
        assert any(
            isinstance(node, ast.Attribute) and node.attr == "compare_digest"
            for node in ast.walk(tree)
        ), "token comparison must use secrets.compare_digest"


class TestRunEndpoint:
    def test_an_unknown_workload_is_rejected_before_any_work(self, client: TestClient) -> None:
        response = client.post(
            "/v1/runs/stream",
            headers=auth(),
            json={"workload": "does_not_exist", "subject": "s", "body": "b"},
        )
        assert response.status_code == 422
        assert "unknown workload" in response.json()["detail"]

    def test_an_empty_body_is_rejected(self, client: TestClient) -> None:
        response = client.post(
            "/v1/runs/stream",
            headers=auth(),
            json={"workload": "incident_triage", "subject": "s", "body": ""},
        )
        assert response.status_code == 422

    def test_an_oversized_body_is_rejected(self, client: TestClient) -> None:
        """An unbounded body is unbounded tokens, which is unbounded cost."""
        response = client.post(
            "/v1/runs/stream",
            headers=auth(),
            json={"workload": "incident_triage", "subject": "s", "body": "x" * 5000},
        )
        assert response.status_code == 422

    def test_the_stream_is_server_sent_events(self, client: TestClient) -> None:
        response = client.post(
            "/v1/runs/stream",
            headers=auth(),
            json={
                "workload": "incident_triage",
                "subject": "s",
                "body": "what is the disaster recovery failover procedure",
            },
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert "event: run_started" in response.text
        assert "event: run_completed" in response.text or "event: error" in response.text

    def test_node_events_are_emitted_in_the_graphs_actual_topological_order(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """FR-004: a live run streamed to the client is only genuinely 'live' if
        the events describe what actually ran, in the order it actually ran.

        Providers are stubbed (per the module docstring's own rule: no test here
        makes a live model call) so the run is deterministic rather than tolerant
        of an 'error' event, which is the only way ordering can be asserted at all.
        """
        import sandscope_agent.api.app as app_module
        from sandscope_agent.router.providers import StubProvider

        monkeypatch.setattr(
            app_module,
            "build_default_providers",
            lambda: [
                StubProvider(
                    "stub",
                    responses=[
                        "[1] Wait time rose before query time, which points at the pool.",
                        "Compare db.pool.wait_ms against db.query.p99_ms to confirm the ordering.",
                    ],
                )
            ],
        )
        response = client.post(
            "/v1/runs/stream",
            headers=auth(),
            json={
                "workload": "incident_triage",
                "subject": "inc-2",
                "body": "db.pool.wait_ms is climbing on orders-db and available connections "
                "reached zero",
                "context": {"service": "analytics-etl", "tier": "3"},
            },
        )
        assert response.status_code == 200
        events = [
            json.loads(line[len("data: ") :])
            for line in response.text.splitlines()
            if line.startswith("data: ")
        ]
        completed_nodes = [e["node"] for e in events if "node" in e]
        # The topology this run must have taken (graph.py's low-risk path):
        # classify -> retrieve -> assess_evidence -> hypothesise -> verify ->
        # propose_action -> risk_gate -> emit. Assert it as a subsequence rather
        # than exact equality so a legitimate extra verify loop iteration cannot
        # make an otherwise-correct test brittle.
        topology = [
            "classify",
            "retrieve",
            "assess_evidence",
            "hypothesise",
            "verify",
            "propose_action",
            "risk_gate",
            "emit",
        ]
        assert completed_nodes, "no node_completed events were emitted at all"
        positions = [topology.index(n) for n in completed_nodes if n in topology]
        assert positions == sorted(positions), (
            f"node events arrived out of topological order: {completed_nodes}"
        )


class TestChaosInjection:
    """FR-011: a visitor can fail a provider and watch failover happen.

    Scoped to a single RUN rather than to a session. The threat model (T-6)
    requires only that one visitor cannot degrade another's run; per-run
    scoping gets there by construction instead of by discipline, because
    there is no state to leak — the router is built inside the stream
    handler and discarded when it ends.
    """

    @pytest.fixture(autouse=True)
    def _two_providers(self, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
        """Two scripted providers so failover has somewhere to go.

        Against the REAL chain this run dies on the spend guard rather than
        the router: with no keys configured the first provider is unavailable,
        failover reaches a costlier model, and reserving its worst case
        exceeds the $0.02 ceiling. That is D-010's fix behaving exactly as
        designed, and it makes the real chain useless for testing THIS.

        Depends on `client` so it runs AFTER it. The client fixture calls
        `importlib.reload` on the api module, which replaces the very
        attribute being patched -- patching first silently reverted, and the
        run then failed on the budget again with no sign that the stub had
        been discarded.
        """
        import sandscope_agent.api.app as app_module
        from sandscope_agent.router.providers import StubProvider

        monkeypatch.setattr(
            app_module,
            "build_default_providers",
            lambda: [
                StubProvider("groq", default="[1] A cited claim."),
                StubProvider("gemini", default="[1] A cited claim."),
            ],
        )

    def _run(self, client: TestClient, inject: list[str] | None = None):
        payload = {
            "workload": "incident_triage",
            "subject": "s",
            "body": "what is the disaster recovery failover procedure",
        }
        if inject is not None:
            payload["inject_failures"] = inject
        return client.post("/v1/runs/stream", headers=auth(), json=payload)

    def test_an_injected_provider_is_reported_as_injected(self, client: TestClient) -> None:
        response = self._run(client, ["groq"])
        assert response.status_code == 200
        assert "injected_failure" in response.text

    def test_a_run_without_injection_reports_none(self, client: TestClient) -> None:
        assert "injected_failure" not in self._run(client).text

    def test_injection_does_not_leak_into_the_next_run(self, client: TestClient) -> None:
        """The property FR-011 actually cares about. If the router were shared,
        the second run would still see groq disabled."""
        self._run(client, ["groq"])
        assert "injected_failure" not in self._run(client).text

    def test_the_surviving_provider_serves_the_run(self, client: TestClient) -> None:
        """The point of the feature: a broken provider is routed AROUND, not
        fatal. Without this the previous assertion would still pass on a run
        that injected a failure and then died."""
        response = self._run(client, ["groq"])
        assert "event: run_completed" in response.text
        assert "gemini" in response.text

    def test_an_unknown_provider_is_refused_rather_than_ignored(self, client: TestClient) -> None:
        """Silently accepting a typo would show the visitor an UNINJECTED run
        and let them conclude the failover does not work.

        Refused BEFORE the stream opens: raising inside the generator cannot
        set a status code, because the 200 has already been sent."""
        response = self._run(client, ["grok"])
        assert response.status_code == 422
        assert "unknown provider" in response.text

    def test_more_injections_than_providers_is_refused(self, client: TestClient) -> None:
        response = self._run(client, ["groq"] * 9)
        assert response.status_code == 422


class TestNoLocalState:
    """NFR-005: the runtime holds no persistent local state.

    The retrieval index is rebuilt from the corpus at startup rather than
    cached to disk (api/app.py's lifespan docstring says so); this is the test
    that actually drives requests through a live process and proves nothing
    on disk changed, rather than trusting the comment.
    """

    def _snapshot(self) -> set[Path]:
        return {p for p in PACKAGE_ROOT.rglob("*") if "__pycache__" not in p.parts}

    def test_serving_requests_writes_nothing_to_the_package_directory(
        self, client: TestClient
    ) -> None:
        before = self._snapshot()
        client.get("/healthz")
        client.get("/v1/workloads", headers=auth())
        client.post(
            "/v1/runs/stream",
            headers=auth(),
            json={
                "workload": "incident_triage",
                "subject": "s",
                "body": "what is the disaster recovery failover procedure",
            },
        )
        after = self._snapshot()
        assert after == before, f"requests created or removed files: {after ^ before}"

    def test_two_lifespans_rebuild_independent_index_instances(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """If the index were persisted rather than rebuilt, two independent
        startups would share the same object; they must not."""
        monkeypatch.setenv("AGENT_SERVICE_TOKEN", "t" * 48)
        monkeypatch.setenv("SANDSCOPE_ENV", "test")
        monkeypatch.setenv("RUN_BUDGET_USD", "0.02")
        import importlib

        from sandscope_agent.api import app as module

        importlib.reload(module)
        with TestClient(module.app):
            first = module._state["retriever"]
        with TestClient(module.app):
            second = module._state["retriever"]
        assert first is not second


class TestWorkloads:
    def test_every_workload_is_advertised(self, client: TestClient) -> None:
        """Asserted against the registry rather than a hard-coded set.

        This previously named the two workloads literally, so adding the
        postmortem workload (FR-009) failed it — correctly, in that the
        endpoint's output had changed, and uselessly, in that the only
        possible fix was to retype the same list in a second place. What the
        endpoint owes a caller is that it advertises everything the runtime
        can actually run; that is the invariant, so that is what is checked.
        """
        from sandscope_agent.orchestrator.workloads import WORKLOADS

        names = {w["name"] for w in client.get("/v1/workloads", headers=auth()).json()["workloads"]}
        assert names == set(WORKLOADS)
        # A guard on the guard: if the registry were ever empty, the assertion
        # above would pass against an endpoint advertising nothing at all.
        assert {"incident_triage", "change_review", "postmortem"} <= names

    def test_each_advertised_workload_names_what_it_proposes(self, client: TestClient) -> None:
        """`action_noun` is what an approval record reads as, so a blank one
        produces a gate asking a human to approve an unnamed thing."""
        workloads = client.get("/v1/workloads", headers=auth()).json()["workloads"]
        for workload in workloads:
            assert workload["action_noun"].strip(), f"{workload['name']} proposes an unnamed thing"


class TestIncidentFeed:
    """FR-003: an incident feed on schedule and on demand.

    `generate_incident` existed since Sprint 1 with nothing that ever called
    it outside a test — the console's picker was, and remains, four hand
    -authored scenarios. These are the first tests that exercise it as an
    actual feed reachable over HTTP.
    """

    def test_current_incident_is_shaped_like_a_run_request(self, client: TestClient) -> None:
        response = client.get("/v1/incidents/current", headers=auth())
        assert response.status_code == 200
        body = response.json()
        for field in ("incident_id", "severity", "workload", "subject", "body", "context"):
            assert field in body, f"missing {field!r}"
        assert body["workload"] in {"incident_triage", "change_review"}
        assert len(body["body"]) > 0

    def test_current_incident_is_stable_within_the_schedule_window(
        self, client: TestClient
    ) -> None:
        """The whole point of 'scheduled' rather than 'random every request' —
        two polls a moment apart must see the same incident."""
        first = client.get("/v1/incidents/current", headers=auth()).json()
        second = client.get("/v1/incidents/current", headers=auth()).json()
        assert first["incident_id"] == second["incident_id"]

    def test_generate_produces_a_fresh_incident_on_demand(self, client: TestClient) -> None:
        """Unlike /current, every call must differ — this is the
        visitor-triggered half of FR-003."""
        seen = {
            client.post("/v1/incidents/generate", headers=auth()).json()["incident_id"]
            for _ in range(5)
        }
        assert len(seen) == 5, f"expected 5 distinct incidents, got {seen}"

    def test_incident_feed_requires_authentication(self, client: TestClient) -> None:
        assert client.get("/v1/incidents/current").status_code in (401, 403)
        assert client.post("/v1/incidents/generate").status_code in (401, 403)

    def test_a_generated_incident_can_actually_drive_a_run(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The feed is only real if its output is runnable, not just shaped
        correctly — this drives an actual triage run from a generated
        incident end to end."""
        import sandscope_agent.api.app as app_module
        from sandscope_agent.router.providers import StubProvider

        monkeypatch.setattr(
            app_module,
            "build_default_providers",
            lambda: [StubProvider("stub", default="[1] A cited claim.")],
        )
        generated = client.post("/v1/incidents/generate", headers=auth()).json()
        response = client.post(
            "/v1/runs/stream",
            headers=auth(),
            json={
                "workload": generated["workload"],
                "subject": generated["subject"],
                "body": generated["body"],
                "context": generated["context"],
            },
        )
        assert response.status_code == 200
        assert "event: run_started" in response.text
