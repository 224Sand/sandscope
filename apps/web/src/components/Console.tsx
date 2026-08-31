"use client";

/**
 * The console. A visitor triggers a run and watches the agent reason.
 *
 * Built against the acceptance criteria in
 * docs/01-requirements/ACCEPTANCE_CRITERIA_CONSOLE.md, which were written
 * before this file existed so that acceptance is judged against criteria rather
 * than against whatever got built.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import Trace from "@/components/Trace";
import architecture from "@/generated/architecture.json";
import { readEvents, type Citation, type NodeEvent, type RunCompleted } from "@/lib/events";

/** The routing chain, in the order the runtime declares it. Derived rather
 *  than typed so the control cannot drift from what the router actually has —
 *  an unknown name is refused upstream with a 422, which would surface to a
 *  visitor as a broken button. */
const PROVIDERS: string[] = architecture.providers;

type MemoryItem = {
  run_id: string;
  workload: string;
  subject: string;
  status: string;
  risk: string | null;
};

const PRESETS = [
  {
    id: "pool",
    label: "Connection pool exhaustion",
    workload: "incident_triage",
    subject: "inc-4471",
    body: "db.pool.wait_ms is climbing on orders-db and available connections reached zero",
    context: { service: "orders-db", tier: "0", signature: "db.pool.saturated" },
  },
  {
    id: "cert",
    label: "TLS certificate expiry",
    workload: "incident_triage",
    subject: "inc-4472",
    body: "tls.handshake_failures_per_s went from zero to full rate in one sample interval on edge-gateway",
    context: { service: "edge-gateway", tier: "0", signature: "tls.handshake.failure" },
  },
  {
    id: "change",
    label: "Change review — raise a pool ceiling",
    workload: "change_review",
    subject: "chg-881",
    body: "raise the orders-db connection pool ceiling from 100 to 200 to absorb peak traffic",
    context: { service: "orders-db", tier: "0", change_kind: "configuration" },
  },
  {
    id: "gap",
    label: "Something the corpus cannot answer",
    workload: "incident_triage",
    subject: "inc-4473",
    body: "what is the disaster recovery failover procedure for a full region loss",
    context: {},
  },
] as const;

type Phase = "idle" | "running" | "done";

const NODE_LABEL: Record<string, string> = {
  classify: "Classify",
  retrieve: "Retrieve evidence",
  assess_evidence: "Assess evidence",
  adjudicate: "Adjudicate",
  hypothesise: "Reason",
  verify: "Verify citations",
  propose_action: "Propose action",
  risk_gate: "Risk gate",
  refuse: "Refuse",
  escalate: "Escalate",
  await_approval: "Await approval",
  emit: "Emit",
};

function verdictChip(verdict?: string) {
  if (verdict === "sufficient") return <span className="chip chip--grounded">evidence sufficient</span>;
  if (verdict === "insufficient") return <span className="chip chip--refused">evidence insufficient</span>;
  if (verdict === "ambiguous") return <span className="chip chip--refused">ambiguous — adjudicating</span>;
  return null;
}

function riskChip(risk?: string | null) {
  if (!risk) return null;
  const blocked = risk === "high" || risk === "critical";
  return (
    <span className={`chip ${blocked ? "chip--blocked" : "chip--neutral"}`}>
      risk: {risk}{blocked ? " — approval required" : ""}
    </span>
  );
}

export default function Console() {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>(PRESETS[0]!);
  const [phase, setPhase] = useState<Phase>("idle");
  const [events, setEvents] = useState<NodeEvent[]>([]);
  const [result, setResult] = useState<RunCompleted | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCitation, setOpenCitation] = useState<string | null>(null);
  const [decision, setDecision] = useState<string | null>(null);
  /** Providers the visitor has chosen to break for the next run (FR-011).
   *  Scoped to the run, not the session: the runtime builds a router per
   *  request and discards it, so nobody else’s run is affected. */
  const [broken, setBroken] = useState<string[]>([]);
  /** What the agent has already been asked in this session (FR-008). */
  const [memory, setMemory] = useState<MemoryItem[] | null>(null);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  /** Whether the client has hydrated.
   *
   *  The session id is read from `sessionStorage` during render, so it is ""
   *  on the server and a real id in the browser. That was harmless while
   *  nothing RENDERED it — and the moment the memory panel displayed it, the
   *  two markups disagreed and React threw a hydration mismatch (#418) on
   *  every page carrying the console. Rendering it only after mount makes the
   *  first client render match the server's by construction, rather than
   *  suppressing the warning and leaving the mismatch there. */
  const [mounted, setMounted] = useState(false);
  const abort = useRef<AbortController | null>(null);

  /**
   * Session identity. sessionStorage rather than a cookie: it scopes memory and
   * binds approvals to the tab that created them, and it is explicitly NOT
   * authentication - the threat model records it as demo-grade (T-17).
   */
  const sessionId = useRef<string>("");
  if (typeof window !== "undefined" && !sessionId.current) {
    const existing = window.sessionStorage.getItem("sandscope.session");
    sessionId.current = existing ?? `sess-${crypto.randomUUID().slice(0, 12)}`;
    window.sessionStorage.setItem("sandscope.session", sessionId.current);
  }

  const start = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    setPhase("running");
    setEvents([]);
    setResult(null);
    setError(null);
    setDecision(null);

    try {
      const response = await fetch("/api/runs/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId.current,
          workload: preset.workload,
          subject: preset.subject,
          body: preset.body,
          context: preset.context,
          inject_failures: broken,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({ error: "unknown" }));
        setError(
          detail.error === "runtime_unreachable"
            ? "The agent runtime is asleep or unreachable. It sleeps after prolonged inactivity on the free tier."
            : detail.error === "limiter_unavailable"
              ? "The rate limiter is unreachable, and this endpoint fails closed by design."
              : `${detail.error}: ${detail.detail ?? ""}`,
        );
        setPhase("done");
        return;
      }

      for await (const event of readEvents(response)) {
        if (event.kind === "node_completed") setEvents((prior) => [...prior, event.data]);
        else if (event.kind === "run_completed") setResult(event.data);
        else if (event.kind === "error") setError(`${event.data.error}: ${event.data.detail}`);
      }
      setPhase("done");
    } catch (caught) {
      if ((caught as Error)?.name !== "AbortError") {
        setError(caught instanceof Error ? caught.message : "unknown failure");
      }
      setPhase("done");
    }
  }, [preset, broken]);

  /** Memory is READ rather than accumulated client-side.
   *
   *  Mirroring the run into local state would show the visitor what this tab
   *  did, not what the agent actually stored — and those differ precisely
   *  when persistence failed, which is the case worth seeing. The runtime
   *  writes memory from the run OUTCOME (db/runs.py explains why), so asking
   *  it is the only honest source. */
  const refreshMemory = useCallback(async () => {
    if (!sessionId.current) return;
    try {
      const response = await fetch(`/api/memory/${sessionId.current}`, { cache: "no-store" });
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as { error?: string };
        setMemoryError(
          detail.error === "runtime_unreachable"
            ? "The runtime is asleep, so its memory cannot be read."
            : "Memory is unavailable.",
        );
        return;
      }
      const payload = (await response.json()) as { items?: MemoryItem[] };
      setMemory(payload.items ?? []);
      setMemoryError(null);
    } catch {
      setMemoryError("Memory is unavailable.");
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    void refreshMemory();
  }, [refreshMemory]);

  useEffect(() => {
    // Re-read once a run finishes: that is when the runtime has written to it.
    if (result) void refreshMemory();
  }, [result, refreshMemory]);

  const terminal = events.find((e) =>
    ["refuse", "escalate", "await_approval", "emit"].includes(e.node),
  );
  const outcome = terminal?.node;
  /**
   * An escalated or refused run produced no accepted answer.
   *
   * The first version rendered the last hypothesis regardless of outcome, so a
   * run the system REFUSED to emit was displayed as though it had been
   * accepted - which contradicts the product's central claim in the one place a
   * visitor would look. The draft is still shown, because hiding it would be
   * worse, but it is labelled as rejected and the uncited claims are named.
   */
  const rejected = outcome === "escalate" || outcome === "refuse";
  const assessment = [...events].reverse().find((e) => e.node === "hypothesise")?.text;
  const uncited = [...events].reverse().find((e) => e.node === "verify")?.uncited ?? [];
  const citations: Citation[] = [...events].reverse().find((e) => e.node === "verify")?.citations ?? [];

  /** Cache effectiveness for the completed run (FR-012).
   *
   *  `estimated_usd` rather than `actual_usd` for the avoided spend: a cache
   *  hit's ACTUAL cost is zero by definition, so summing that would report $0
   *  avoided on every run. What was avoided is what the call would have been
   *  reserved at had it gone to a provider. */
  const cache = (() => {
    const ledger = result?.ledger ?? [];
    const hits = ledger.filter((entry) => entry.cache_hit);
    return {
      calls: ledger.length,
      rate: ledger.length === 0 ? 0 : hits.length / ledger.length,
      spendAvoided: hits.reduce((total, entry) => total + entry.estimated_usd, 0),
    };
  })();
  const proposal = events.find((e) => e.node === "propose_action")?.proposal;
  const risk = events.find((e) => e.node === "risk_gate");
  const evidence = events.find((e) => e.node === "assess_evidence");
  const retrieval = events.find((e) => e.node === "retrieve");

  return (
    <div className="stack-5">
      <section className="panel">
        <h3 className="mb-4">Choose a scenario</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s2)", marginBottom: "var(--s4)" }}>
          {PRESETS.map((option) => (
            <button
              key={option.id}
              onClick={() => setPreset(option)}
              aria-pressed={preset.id === option.id}
              style={{
                borderColor: preset.id === option.id ? "var(--accent)" : "var(--line)",
                color: preset.id === option.id ? "var(--text)" : "var(--text-2)",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mono muted mb-4" >
          {preset.body}
        </p>
        {/* FR-011. The reliability claim on the landing page is deterministic
            failover; this is where a visitor gets to disbelieve it and check.
            Breaking a provider is scoped to the next run only. */}
        <fieldset className="chaos">
          <legend className="chaos-legend">Break a provider for this run</legend>
          <div className="chaos-row">
            {PROVIDERS.map((name) => {
              const on = broken.includes(name);
              return (
                <label key={name} className="chaos-item" data-on={on ? "true" : "false"}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={phase === "running"}
                    onChange={() =>
                      setBroken((current) =>
                        current.includes(name)
                          ? current.filter((p) => p !== name)
                          : [...current, name],
                      )
                    }
                  />
                  <span className="mono">{name}</span>
                </label>
              );
            })}
          </div>
          <p className="chaos-note">
            {broken.length === 0
              ? "Nothing broken. The chain routes in its declared order."
              : broken.length >= PROVIDERS.length
                ? "Every provider broken — the run should fail closed rather than invent an answer."
                : `${broken.join(", ")} will be treated as failed. Watch the trace route past ${broken.length === 1 ? "it" : "them"}.`}
          </p>
        </fieldset>
        <button
          onClick={start}
          disabled={phase === "running"}
          style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#001" }}
        >
          {phase === "running" ? "Running…" : "Run triage"}
        </button>
      </section>

      {error && (
        <section className="panel" style={{ borderColor: "var(--blocked)" }}>
          <span className="chip chip--blocked">error</span>
          <p className="mt-3-muted">{error}</p>
        </section>
      )}

      {events.length > 0 && (
        <section className="panel">
          <h3 className="mb-4">Execution</h3>
          <ol className="plain-list">
            {events.map((event, index) => (
              <li
                key={`${event.node}-${index}`}
                className="rise"
                style={{
                  display: "flex", alignItems: "baseline", gap: "var(--s3)",
                  padding: "var(--s2) 0", borderBottom: "1px solid var(--line)",
                }}
              >
                <span className="mono" style={{ color: "var(--text-3)", minWidth: "2ch" }}>
                  {index + 1}
                </span>
                <span style={{ minWidth: "16ch", fontWeight: 500 }}>
                  {NODE_LABEL[event.node] ?? event.node}
                </span>
                <span className="mono muted finer" >
                  {event.node === "retrieve" && `${event.hits} passages${event.degraded ? " · degraded" : ""}`}
                  {event.node === "assess_evidence" && event.rationale}
                  {event.node === "adjudicate" && event.rationale}
                  {event.node === "hypothesise" &&
                    `attempt ${event.attempt}${event.correcting ? ` · correcting ${event.correcting} uncited` : ""}`}
                  {event.node === "verify" &&
                    `${event.citations?.length ?? 0} cited · ${event.uncited?.length ?? 0} uncited`}
                  {event.node === "risk_gate" && event.reason}
                  {["refuse", "escalate", "await_approval", "emit"].includes(event.node) && event.status}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {evidence && (
        <section className="panel">
          <div className="row-wrap mb-4">
            {verdictChip(evidence.verdict)}
            {riskChip(risk?.risk)}
            {retrieval?.degraded && <span className="chip chip--refused">retrieval degraded</span>}
          </div>
          {retrieval?.top_documents && (
            <p className="mono dim finer">
              searched: {retrieval.top_documents.join(" · ")}
            </p>
          )}
        </section>
      )}

      {outcome === "refuse" && (
        <section className="panel" style={{ borderLeft: "2px solid var(--refused)" }}>
          <span className="chip chip--refused">refused — evidence does not support an answer</span>
          <p style={{ marginTop: "var(--s4)", color: "var(--text-2)" }}>
            {evidence?.rationale}
          </p>
          <p style={{ marginTop: "var(--s3)", color: "var(--text-3)", fontSize: "0.9375rem" }}>
            This is the system working, not failing. Over-refusal costs a follow-up
            question; the other direction costs correctness.
          </p>
        </section>
      )}

      {assessment && outcome !== "refuse" && (
        <section
          className="panel"
          style={{ borderLeft: `2px solid ${rejected ? "var(--blocked)" : "var(--grounded)"}` }}
        >
          <div className="row-wrap mb-4">
            <h3 style={{ margin: 0 }}>{rejected ? "Draft — not emitted" : "Assessment"}</h3>
          </div>
          {rejected && (
            <div className="mb-5">
              <span className="chip chip--blocked">escalated after 3 attempts</span>
              <p className="mt-3-muted">
                {uncited.length} claim{uncited.length === 1 ? "" : "s"} still carried no
                citation, so this was <strong>not emitted</strong>. It is shown because
                hiding it would be worse than labelling it.
              </p>
              {uncited.length > 0 && (
                <ul className="mono" style={{ marginTop: "var(--s3)", color: "var(--blocked)", fontSize: "0.8125rem" }}>
                  {uncited.map((claim, index) => (
                    <li key={index}>{claim.slice(0, 160)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <pre
            className="mono"
            style={{ whiteSpace: "pre-wrap", margin: 0, color: "var(--text)" }}
          >
            {assessment}
          </pre>

          {citations.length > 0 && (
            <>
              <hr className="hairline rule-y"/>
              <h3 style={{ marginBottom: "var(--s3)", fontSize: "1rem" }}>
                Evidence ({citations.length} claims cited)
              </h3>
              <ul className="plain-list">
                {citations.map((citation, index) => (
                  <li key={index}>
                    <button
                      onClick={() =>
                        setOpenCitation(openCitation === `${index}` ? null : `${index}`)
                      }
                      style={{
                        width: "100%", textAlign: "left", background: "var(--surface-2)",
                        borderColor: citation.resolved ? "var(--line)" : "var(--blocked)",
                        padding: "var(--s3)",
                      }}
                    >
                      <span className="mono muted finer" >
                        {citation.resolved ? citation.chunk_id : "UNRESOLVED CITATION"}
                      </span>
                      <div style={{ marginTop: "var(--s1)", fontSize: "0.9375rem" }}>
                        {citation.claim}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {proposal && (
        <section
          className="panel"
          style={{
            borderColor:
              risk?.risk === "high" || risk?.risk === "critical" ? "var(--blocked)" : "var(--line)",
          }}
        >
          <h3 className="mb-3">Proposed {risk?.risk === "critical" ? "action" : "remediation"}</h3>
          <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{proposal}</pre>
          {(risk?.risk === "high" || risk?.risk === "critical") && (
            <>
              <hr className="hairline rule-y"/>
              <p className="muted mb-4">
                This action is above the risk threshold. The run has stopped and nothing
                proceeds until a human decides. Approving starts a new run carrying the
                decision — the approval step cannot auto-proceed.
              </p>
              {/* Neither button is the primary action. A gate where one choice is
                  styled as the obvious one is not a gate. */}
              {decision ? (
                <p className="mono muted">{decision}</p>
              ) : (
                /* Neither button is the primary action. A gate where one choice
                   is styled as the obvious one is not a gate. */
                <div style={{ display: "flex", gap: "var(--s3)" }}>
                  {(["approved", "rejected"] as const).map((choice) => (
                    <button
                      key={choice}
                      onClick={async () => {
                        if (!result?.run_id) return;
                        const response = await fetch(`/api/runs/${result.run_id}/approve`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ decision: choice }),
                        });
                        const payload = await response.json().catch(() => ({}));
                        setDecision(
                          response.ok
                            ? `${choice} — continuation run ${payload.continuation_run}. The gated run was not resumed.`
                            : `could not record the decision: ${payload.error ?? response.status}`,
                        );
                      }}
                    >
                      {choice === "approved" ? "Approve" : "Reject"}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {result && <Trace spans={result.spans} ledger={result.ledger} totalMs={result.total_ms} />}

      {result && (
        <section className="panel">
          <h3 className="mb-4">Run</h3>
          <dl
            style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "var(--s4)", margin: 0,
            }}
          >
            {[
              ["status", result.status],
              ["cost", `$${result.cost_usd.toFixed(6)}`],
              ["claims cited", result.citations],
              ["uncited", result.uncited],
              // FR-012 asks for a VISIBLE hit rate and the spend it avoided.
              // Both were computed and tested in the router and neither
              // reached the surface: only the raw token count did, which says
              // nothing about how often the cache actually helped. Derived
              // from the ledger the run already sends rather than added to the
              // event contract — the numbers were there, unread.
              ["cache hit rate", cache.calls === 0 ? "—" : `${Math.round(cache.rate * 100)}%`],
              [
                "spend avoided",
                cache.calls === 0 ? "—" : `$${cache.spendAvoided.toFixed(6)}`,
              ],
              ["tokens avoided by cache", result.tokens_avoided],
              ["provider events", result.providers.length],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="dim finer">{label}</dt>
                <dd className="mono" style={{ margin: "var(--s1) 0 0", fontSize: "1.125rem" }}>
                  {String(value)}
                </dd>
              </div>
            ))}
          </dl>
          {result.providers.length > 0 && (
            <p className="mono note" >
              {result.providers.map((p) => `${p.provider}:${p.event}`).join("  ")}
            </p>
          )}
        </section>
      )}

      {/* FR-008. The runtime has recalled session memory since Sprint 3 and
          nothing ever asked it for any, so "visible to the user" was the half
          of the requirement that did not exist. Read from the runtime rather
          than mirrored from this tab's own runs: the two differ exactly when
          persistence failed, which is the case worth seeing. */}
      <section className="panel" data-testid="memory-panel">
        <header className="row-between">
          <h3>Session memory</h3>
          <span className="mono dim finest">
            {mounted ? sessionId.current : ""}
          </span>
        </header>
        <p style={{ color: "var(--text-3)", fontSize: "0.8125rem", margin: "var(--s2) 0 var(--s4)" }}>
          What the agent has stored about this session, newest first and capped — an
          unbounded recall is an unbounded prompt, which is an unbounded bill. Written
          from the run&rsquo;s outcome rather than from the model&rsquo;s own summary of
          itself, because a model asked what it should remember writes something
          flattering.
        </p>

        {memoryError ? (
          <p className="mono" style={{ color: "var(--refused)", fontSize: "0.8125rem" }}>
            {memoryError}
          </p>
        ) : memory === null ? (
          <p className="mono dim finer">reading…</p>
        ) : memory.length === 0 ? (
          <p className="mono dim finer">
            Nothing stored yet. Run a triage and it will appear here.
          </p>
        ) : (
          <ol className="memory-list">
            {memory.map((item) => (
              <li key={item.run_id} className="memory-item">
                <span className="mono memory-run">{item.run_id}</span>
                <span className="memory-subject">{item.subject}</span>
                <span className="mono memory-workload">{item.workload}</span>
                <span className={`chip ${item.status === "completed" ? "chip--grounded" : "chip--neutral"}`}>
                  {item.status.replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
