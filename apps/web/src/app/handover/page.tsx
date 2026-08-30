import DepthControl from "@/components/DepthControl";
import EvidenceGate from "@/components/EvidenceGate";
import architecture from "@/generated/architecture.json";
import council from "@/generated/council.json";
import dataset from "@/generated/dataset.json";
import delivery from "@/generated/delivery.json";
import config from "@/generated/product.config.json";
import reliability from "@/generated/reliability.json";

export const metadata = { title: `Handover — ${config.name}` };

/**
 * The complete knowledge transfer, for two audiences at once (FR-033).
 *
 * A CTO and a non-technical stakeholder need the same document and different
 * depths of it. The usual answers are both wrong: writing for the middle
 * patronises one and starves the other, and writing two documents guarantees
 * one of them goes stale.
 *
 * So every topic here is layered. The prose reads end to end in plain language
 * with no jargon left undefined — that is the whole document for one reader.
 * Beneath the topics that have more to say sits a `<details>` block carrying
 * the parameters, the formulas and the failure modes. Native disclosure, not a
 * toggle: it works with JavaScript off, it is keyboard-operable for free, and
 * every word is in the DOM for search and for a screen reader (AC-C10).
 *
 * Numbers come from the generated record wherever one exists. Constants that
 * live only in source are written out with the file that holds them, so a
 * reader can check rather than trust.
 */

function Deep({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="deep">
      <summary className="deep-summary">
        <span className="mono deep-tag">deeper</span>
        {label}
      </summary>
      <div className="deep-body">{children}</div>
    </details>
  );
}

function Stat({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div>
      <div className="mono stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function Handover() {
  const gate = reliability.gate;
  const model = reliability.model;
  const reranker = reliability.reranker;
  const roleReactions = council.artifacts.reduce((n, a) => n + a.reactions.length, 0);

  return (
    <main className="voice-proof wrap kt" style={{ paddingTop: "var(--s8)", paddingBottom: "var(--s10)" }}>
      {/* Ambient ground. Poster-first, muted, decorative, and replaced by the
          still below 768px or under reduced motion (DESIGN_SYSTEM §5). It sits
          behind the opening only — a reader scanning for a threshold does not
          want motion competing with the paragraph they are in. */}
      <div className="kt-ground" aria-hidden="true">
        <video
          className="kt-ground-video"
          src="/media/handover.mp4"
          poster="/media/handover.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="none"
        />
        <div className="kt-ground-scrim" />
      </div>

      <header style={{ marginBottom: "var(--s7)" }}>
        <p className="mono" style={{ color: "var(--text-3)", marginBottom: "var(--s3)" }}>
          {config.wordmark} / HANDOVER
        </p>
        <h2 style={{ marginBottom: "var(--s4)" }}>Everything, at whatever depth you need</h2>
        <p style={{ color: "var(--text-2)", fontSize: "1.0625rem", maxWidth: "70ch" }}>
          One document for two readers. The prose reads end to end in plain language and assumes
          nothing — that is the whole handover for someone who does not write code. Wherever there
          is more to say, a <strong>deeper</strong> block underneath carries the parameters, the
          formulas, the tradeoffs and the failure modes.
        </p>
        <p style={{ color: "var(--text-3)", fontSize: "0.9375rem", marginTop: "var(--s4)", maxWidth: "70ch" }}>
          Writing for the middle would patronise one reader and starve the other. Writing two
          documents would guarantee one of them goes stale. Nothing below is hidden from search or
          from a screen reader — the disclosure is native, and works with JavaScript off.
        </p>
      </header>

      <DepthControl />

      <section className="reveal-scale story-stats" style={{ marginBottom: "var(--s8)" }}>
        <Stat value={`${delivery.requirements.done}/${delivery.requirements.total}`} label="Requirements" note="each names a passing test" />
        <Stat value={pct(gate.falseAnswer.rate)} label="False answers" note={`budget ${pct(gate.falseAnswer.budget)}`} />
        <Stat value={String(delivery.defects.total)} label="Defects published" note={`${delivery.defects.severityOne} severity 1`} />
        <Stat value={String(architecture.counts.adrs)} label="Decisions recorded" />
        <Stat value="$0" label="Infrastructure" note="asserted by a test" />
      </section>

      {/* ═══════════════════════════════════════════════════ 1. orientation */}
      <section className="kt-section">
        <p className="act-label">One</p>
        <h3>What this is, and who it is for</h3>

        <p>
          {config.wordmark} answers questions about a company&rsquo;s production software — the kind
          an on-call engineer asks at 3am. <em>Why did the database slow down? Is this change safe
          to ship?</em> It reads a fixed library of internal documents, finds the relevant
          passages, and answers with a reference beside every claim, like footnotes in an essay.
        </p>
        <p>
          When the documents do not actually answer the question, it says so. That refusal is the
          product.
        </p>
        <p>
          The company is invented — every service, document and incident was authored for this
          project, and the <a href="/data">data page</a> publishes all of it. The engineering is
          not invented: the services run, the tests pass, and both halves are deployed.
        </p>

        <div className="pull">Anything can answer. The engineering is in knowing when not to.</div>

        <Deep label="Why an agent needs this at all, and what it costs to skip">
          <p>
            The obstacle to putting an agent near production is rarely capability — models are
            good enough to read a runbook and reason about a metric. It is accountability: nobody
            can explain afterwards why it said what it said, so nobody can sign off on it going
            live.
          </p>
          <p>
            Three things have to be true before that sign-off is possible, and this system exists
            to make all three checkable. Every claim traces to a passage. The system declines
            rather than filling a gap. Every run leaves an inspectable record of what it did, what
            it cost, and where it stopped.
          </p>
          <p>
            The alternative failure is specific and expensive: a confident, well-cited, entirely
            wrong answer about a service the evidence was never about. That is the case the
            evaluation set is deliberately loaded with — see the 214 questions described below.
          </p>
        </Deep>
      </section>

      {/* ═════════════════════════════════════════════════════ 2. the gate */}
      <section className="kt-section">
        <p className="act-label">Two</p>
        <h3>The refusal decision</h3>

        <p>
          Before answering, the system scores whether what it found is good enough. The score falls
          into one of three bands, and it behaves visibly differently in each: it answers with
          citations, it answers but flags the answer as partial, or it refuses and produces no
          draft at all.
        </p>
        <p>
          Measured over {reliability.sample.answerable + reliability.sample.unanswerable} questions
          where the right answer is known: it wrongly answers{" "}
          <strong>{gate.falseAnswer.counts}</strong> questions it should refuse ({pct(gate.falseAnswer.rate)},
          against a {pct(gate.falseAnswer.budget)} budget) and wrongly refuses{" "}
          <strong>{gate.falseRefusal.counts}</strong> it could have answered ({pct(gate.falseRefusal.rate)},
          against {pct(gate.falseRefusal.budget)}).
        </p>
        <p>
          Those budgets are deliberately asymmetric. A wrong answer about production is far more
          expensive than an unnecessary &ldquo;I don&rsquo;t know&rdquo;, so the system is tuned to
          make the second mistake rather than the first.
        </p>

        <EvidenceGate />

        <Deep label="The actual signals, thresholds, and why they are multiplied">
          <p>
            <strong>No single retrieval signal separates the two classes.</strong> Measured on the
            first 20 questions: dense similarity gave answerable-min 0.268 against unanswerable-max
            0.270 — a margin of <em>minus</em> 0.003. Term coverage was worse at −0.333, because
            &ldquo;what is the data retention obligation&rdquo; scores 1.00 against a sentence
            saying retention is explicitly <em>not</em> covered. Every query term present, inside a
            disclaimer.
          </p>
          <p>
            The fused, normalised score is useless here by construction: normalising within a result
            set makes the top hit 1.0 whether the match was excellent or hopeless. A prior system
            read 0.031 on both classes — structurally incapable of refusing, at any threshold.
          </p>
          <p>
            So the gate uses the <strong>product</strong> of unnormalised dense cosine and
            unnormalised BM25, not their sum. Multiplication requires both signals to be present: a
            high lexical score from one repeated identifier, with no semantic proximity, cannot
            clear the bar alone.
          </p>
          <table className="kt-table">
            <thead><tr><th>Constant</th><th>Value</th><th>What it does</th></tr></thead>
            <tbody>
              <tr><td className="mono">INSUFFICIENT_BELOW</td><td className="mono">0.74</td><td>Below this, refuse outright</td></tr>
              <tr><td className="mono">SUFFICIENT_ABOVE</td><td className="mono">10.38</td><td>Above this, answer</td></tr>
              <tr><td className="mono">MIN_TERM_COVERAGE</td><td className="mono">0.30</td><td>Too few query terms present — refuse before scoring</td></tr>
            </tbody>
          </table>
          <p>
            Between 0.74 and 10.38 the verdict is <span className="chip chip--refused">ambiguous</span>{" "}
            and routes to an explicit adjudication step. That band is wide on purpose: the overlap
            is real and is <em>reported</em> rather than tuned away. It is also the system&rsquo;s
            biggest live weakness — 87% of questions land in it.
          </p>
          <p>
            One further guard sits on top. A question demanding a specific value
            (&ldquo;how long&rdquo;, &ldquo;what is the limit&rdquo;) whose retrieved passages
            contain no value is downgraded to ambiguous rather than answered — never straight to
            refusal, because it is a heuristic about question shape and a heuristic is not entitled
            to refuse on its own authority. It exists because &ldquo;how long is the observation
            period between regions&rdquo; scored 8.85 against a passage that says an observation
            period exists and never says how long.
          </p>
          <p className="mono kt-src">apps/agent/sandscope_agent/retrieval/evidence.py</p>
        </Deep>
      </section>

      {/* ═══════════════════════════════════════════════════════ 3. the data */}
      <section className="kt-section">
        <p className="act-label">Three</p>
        <h3>What it knows, and what it deliberately does not</h3>

        <p>
          The library is {dataset.corpus.documents} documents — {dataset.corpus.words.toLocaleString()}{" "}
          words of runbooks, policies, postmortems and architecture notes — split into{" "}
          {dataset.corpus.chunks} passages. Small on purpose: a corpus you can read in an afternoon
          is one where you can check the answers yourself.
        </p>
        <p>
          The invented company has {dataset.estate.services} services in{" "}
          {Object.keys(dataset.estate.byTier).length} criticality tiers with{" "}
          {dataset.estate.dependencies} dependencies between them, and{" "}
          {dataset.faults.length} things that can go wrong, each with the runbook that covers it.
        </p>
        <p>
          The thresholds above come from {dataset.questions.total} questions where the correct
          behaviour is known in advance — {dataset.questions.answerable} answerable,{" "}
          {dataset.questions.unanswerable} deliberately not. Crucially, nobody labelled them by
          hand. An answerable question is generated <em>from</em> the passage that answers it, so
          the passage is the answer by construction.
        </p>

        <Deep label="How each question is manufactured, and the trick that matters">
          <table className="kt-table">
            <thead><tr><th>Count</th><th>Mechanism</th><th>Label</th></tr></thead>
            <tbody>
              {dataset.questions.mechanisms.map((m) => (
                <tr key={m.id}>
                  <td className="mono">{m.count}</td>
                  <td>{m.id.replace(/_/g, " ")}</td>
                  <td>
                    <span className={m.label === "answerable" ? "chip chip--grounded" : "chip chip--refused"}>
                      {m.label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <strong>The 214 matter more than the rest combined.</strong> They take a property the
            corpus documents for <em>one</em> service and ask it of another —{" "}
            <span className="mono">&ldquo;what is the connection pool ceiling for events-bus&rdquo;</span>,
            when the ceiling of 100 is documented for <span className="mono">orders-db</span> and
            nothing else. Retrieval returns a real passage with a real number about the wrong
            subject. A system without an evidence gate answers confidently and is completely wrong,
            and nothing about the answer looks wrong.
          </p>
          <p>
            <strong>Absence is verified, not assumed.</strong> Gap questions are dropped at
            generation time if the corpus turns out to contain the terms after all. That check
            exists because the gap list was wrong once: it claimed the corpus could not say who
            approves an emergency change. It can. The gate scored it answerable, the author had
            marked it unanswerable, and the author was wrong — recorded in the open rather than
            deleted, because a gap list is itself a claim about the corpus.
          </p>
          <p>
            Without verified gaps, &ldquo;correct refusal&rdquo; cannot be measured at all: every
            refusal counts as a mistake, and the threshold could be set to zero with no test
            noticing.
          </p>
          <p className="mono kt-src">apps/agent/corpus/GAPS.md · sandscope_agent/evaluation/dataset.py · <a href="/data">the full inventory</a></p>
        </Deep>
      </section>

      {/* ═══════════════════════════════════════════════════ 4. architecture */}
      <section className="kt-section">
        <p className="act-label">Four</p>
        <h3>How it is put together</h3>

        <p>Four pieces, each with one job.</p>
        <ul>
          <li><strong>The website</strong> — what a visitor sees, and the only thing holding the password to the AI service.</li>
          <li><strong>The agent</strong> — the thinking: find evidence, judge it, draft, check its own citations.</li>
          <li><strong>The memory</strong> — the documents, and a record of every past run.</li>
          <li><strong>The models</strong> — five external AI providers in a fixed order, with automatic failover.</li>
        </ul>
        <p>
          The browser never talks to the agent directly and never holds its credentials. Everything
          goes through the website&rsquo;s own server, which is the only component that knows where
          the agent lives. The <a href="/architecture">architecture page</a> draws the request path,
          and every box on it links to the file that implements it.
        </p>

        <Deep label="The orchestration graph, node by node">
          <p>
            One compiled graph, 12 nodes, and every workload runs on it. Incident triage, change
            review and postmortem drafting differ only in data — a query builder, a system prompt,
            and a deterministic risk scorer. A second graph would disprove exactly the
            workload-agnosticism the first is meant to demonstrate.
          </p>
          <p className="mono kt-flow">
            classify → retrieve → assess_evidence ⟨refuse ∣ adjudicate ∣ hypothesise⟩<br />
            hypothesise → verify ⟨hypothesise ∣ escalate ∣ propose_action⟩<br />
            propose_action → risk_gate ⟨await_approval ∣ emit⟩
          </p>
          <p>
            Four terminal states: <span className="mono">refuse</span>,{" "}
            <span className="mono">escalate</span>, <span className="mono">await_approval</span>,{" "}
            <span className="mono">emit</span>. The important one is the third —{" "}
            <strong>await_approval has no outgoing edge to any node that does work</strong>. A gated
            run is never resumed; approving it creates a <em>new</em> run pointing back at the
            gated one, so the pause is permanently in the record rather than erased by the decision
            (ADR-0006). A test enumerates the compiled graph&rsquo;s edges to assert this, because
            reading the builder only proves what the author intended.
          </p>
          <p>
            The <span className="mono">verify → hypothesise</span> edge is the citation loop. If a
            claim carries no resolvable citation, the draft goes back with feedback. An earlier
            version re-sent an identical prompt, so the retry could never succeed — the edge
            existed, the feedback did not (D-005).
          </p>
          <p className="mono kt-src">apps/agent/sandscope_agent/orchestrator/graph.py</p>
        </Deep>

        <Deep label="Retrieval: parameters, weights, and the degraded path">
          <table className="kt-table">
            <thead><tr><th>Component</th><th>Setting</th></tr></thead>
            <tbody>
              <tr><td>Lexical</td><td className="mono">BM25, k1 = 1.5, b = 0.75</td></tr>
              <tr><td>Dense</td><td className="mono">768-dimension hashing embedder, cosine</td></tr>
              <tr><td>Fusion weights</td><td className="mono">lexical 0.6 · dense 0.4</td></tr>
              <tr><td>Chunking</td><td className="mono">heading-aligned, min 200 chars, merged below that</td></tr>
              <tr><td>Default depth</td><td className="mono">top 6</td></tr>
            </tbody>
          </table>
          <p>
            Lexical is weighted higher because identifiers carry more diagnostic information than
            phrasing in this corpus — BM25&rsquo;s separation between the two classes measured
            better than 3× the dense signal&rsquo;s.
          </p>
          <p>
            When the embedder is unavailable, retrieval degrades to lexical-only and{" "}
            <strong>says so</strong>. A degraded run is marked ambiguous rather than scored: the
            combined score is a product, so a missing dense term makes it zero, and zero would read
            as &ldquo;weak evidence&rdquo; when it means &ldquo;unresolved evidence&rdquo;. Those are
            different states and conflating them is how a system quietly returns worse answers while
            reporting normal operation.
          </p>
          <p className="mono kt-src">retrieval/bm25.py · retrieval/embedding.py · retrieval/hybrid.py</p>
        </Deep>
      </section>

      {/* ═════════════════════════════════════════════════ 5. reliability */}
      <section className="kt-section">
        <p className="act-label">Five</p>
        <h3>What happens when things go wrong</h3>

        <p>
          Three habits repeat throughout, and each exists because of a specific failure that
          already happened here.
        </p>
        <ul>
          <li><strong>It fails safe, not open.</strong> If the traffic limiter cannot be reached, requests are refused rather than allowed through. An outage becomes unavailability, never unlimited free AI for whoever finds the URL.</li>
          <li><strong>It reserves money before spending it.</strong> Every model call is costed and reserved before it goes out. No budget, no call.</li>
          <li><strong>Risky actions stop for a human.</strong> Anything touching production halts and waits.</li>
        </ul>
        <p>
          You can test the failover yourself on the <a href="/console">console</a>: tick a provider
          off, run a question, and watch the trace route around it.
        </p>

        <Deep label="Router, cache and spend guard — with the defect behind each">
          <p>
            <strong>Router.</strong> Fixed order: {architecture.providers.join(" → ")}. A
            rate-limited provider is disabled for a <em>bounded</em> interval, and the clock is
            injected so expiry is tested rather than waited on. Failure injection is scoped to a
            single run — the router is built inside the stream handler and discarded when it ends,
            so no visitor can degrade another&rsquo;s run (T-6).
          </p>
          <p>
            <strong>Spend guard.</strong> Reserves against the <em>most expensive provider that
            could still serve</em>, before the call. Pricing the first candidate under-reserved by
            4× the moment failover reached a costlier model (D-010) — the guard had assumed the
            cheapest option would serve. Default ceiling{" "}
            <span className="mono">RUN_BUDGET_USD = 0.02</span>; a zero ceiling now prevents startup
            rather than killing every run mid-stream with a stack trace (D-007).
          </p>
          <p>
            <strong>Semantic cache.</strong> Exact hash first, then vector similarity. Its threshold
            belongs to the <em>embedder</em> rather than the cache — a module-level constant was
            wrong in both directions at once (ADR-0008). The defect worth knowing is D-006: the
            cache served the previous answer to a <em>correction retry</em>, at 0.886 similarity
            against a 0.60 threshold. Both components were individually correct and individually
            measured. The cache&rsquo;s test asked whether two different questions collide
            (0.208 — correctly no). Nobody asked whether a prompt collides with its own correction
            until the two were wired together and run.
          </p>
          <p className="mono kt-src">router/router.py · router/cache.py · orchestrator/budget.py</p>
        </Deep>

        <Deep label="Applied ML, and the model that is deliberately switched off">
          <table className="kt-table">
            <thead><tr><th>Artefact</th><th>Result</th><th>In the live path?</th></tr></thead>
            <tbody>
              <tr>
                <td>Sufficiency classifier</td>
                <td className="mono">AUC {model.auc.toFixed(3)} vs {model.baselineAuc.toFixed(3)} baseline</td>
                <td><span className="chip chip--blocked">no</span></td>
              </tr>
              <tr>
                <td>Cross-encoder re-ranker</td>
                <td className="mono">chunk MRR {reranker.chunkLevel.hybrid.toFixed(3)} → {reranker.chunkLevel.finetuned.toFixed(3)}, p50 {reranker.latencyP50Ms}ms</td>
                <td><span className="chip chip--refused">trained, not wired</span></td>
              </tr>
            </tbody>
          </table>
          <p>
            The classifier is the most instructive thing in the project.{" "}
            <strong>It is trained, calibrated, ONNX-served, tested — and not used.</strong> Wiring
            it in was measured rather than assumed: as a hard gate it refuses{" "}
            <strong>56.8%</strong> of answerable questions against a 10% budget, because its
            threshold was calibrated for a false-<em>answer</em> budget and is properly conservative
            as a probability, catastrophic as a binary decision.
          </p>
          <p>
            A tuned two-sided band looked excellent — deferral fell from 87.3% to 1.3% with both
            error rates apparently unchanged. Then it was scored on folds it had not been tuned on:{" "}
            <strong>6.1% false answers against a 5% budget</strong>, and 2 of 5 folds could find no
            workable band at all. The improvement was the band memorising the questions it was
            graded on.
          </p>
          <p>
            That is D-001 in different clothes, and much harder to spot: 715 is a real sample, a
            sweep is a reasonable thing to do, and the result was plausible in size and direction.
            It would have shipped as genuine. The one-line lesson:{" "}
            <em>an operating point chosen on the data it is then scored against is not a
            measurement, it is a memory of that data.</em>
          </p>
          <p>
            Both models are trained offline and served as ONNX with no training framework in the
            serving image (ADR-0009). That turned out to be a security boundary too — the training
            extra carries four known RCE advisories while the runtime closure audits clean.
          </p>
          <p className="mono kt-src">ADR-0013 · training/evaluate_classifier_as_gate.py</p>
        </Deep>
      </section>

      {/* ═══════════════════════════════════════════════════ 6. security */}
      <section className="kt-section">
        <p className="act-label">Six</p>
        <h3>Security posture</h3>

        <p>
          The endpoint is public, and it spends money on someone else&rsquo;s API when used. Those
          two facts together are the whole threat picture: the realistic attack is not data theft,
          it is running up a bill or degrading the demonstration for other visitors.
        </p>
        <p>
          The strongest control is architectural rather than defensive:{" "}
          <strong>no tool executes against any real system.</strong> Remediation is text. The worst
          outcome of a successful prompt injection is a wrong answer, not a wrong action.
        </p>

        <Deep label="Threat model, controls, and the residual risks that are accepted">
          <table className="kt-table">
            <thead><tr><th>Threat</th><th>Control</th></tr></thead>
            <tbody>
              <tr><td className="mono">T-1 unbounded spend</td><td>Per-IP sliding window, daily token ceiling, spend guard — all fail closed</td></tr>
              <tr><td className="mono">T-3 runtime called directly</td><td>Bearer token on every route, constant-time comparison</td></tr>
              <tr><td className="mono">T-4/T-5 prompt injection</td><td>Corpus immutable at runtime; retrieved and user content both delimited, neither granted instruction authority</td></tr>
              <tr><td className="mono">T-9 IP correlation</td><td>Salted digest only; no raw address persisted anywhere</td></tr>
              <tr><td className="mono">T-11 model triggers an action</td><td>No tool acts externally. Risk-gated actions additionally require terminal human approval</td></tr>
              <tr><td className="mono">T-12 token reaches the browser</td><td>Read only in route handlers; a test greps the built client bundle and fails on a match</td></tr>
              <tr><td className="mono">T-16 secret in a trace attribute</td><td>Span exporter uses an allowlist — anything else is dropped, not redacted, because a redaction that fails is invisible</td></tr>
            </tbody>
          </table>
          <p>
            <strong>Accepted residual risks, stated rather than closed.</strong> Session identity is
            a cookie: it scopes memory and binds approvals, and it is explicitly not authentication
            (T-17). SSE connection exhaustion is Medium (T-14). Prompt injection through the
            incident body is Medium and accepted, on the grounds that no tool can act (T-15).
          </p>
          <p>
            The pipeline runs CodeQL, Semgrep, Trivy, gitleaks, pip-audit, npm audit, a CycloneDX
            SBOM, OWASP ZAP and six scripted penetration tests. It has found real problems including
            in itself — a shell injection in a workflow input, an unbounded request body, and a
            rate-limit test that <strong>passed while the service was down</strong> because its
            condition accepted any status ≥ 400 and could not tell &ldquo;refused correctly&rdquo;
            from &ldquo;not running&rdquo; (D-013).
          </p>
          <p className="mono kt-src">docs/05-security/THREAT_MODEL.md</p>
        </Deep>

        <Deep label="Data model, and what is persisted">
          <p>
            17 tables. The estate and corpus: <span className="mono">service</span>,{" "}
            <span className="mono">service_dependency</span>, <span className="mono">telemetry_event</span>,{" "}
            <span className="mono">incident</span>, <span className="mono">document</span>,{" "}
            <span className="mono">chunk</span>, <span className="mono">chunk_embedding</span>. The
            record of what happened: <span className="mono">session</span>,{" "}
            <span className="mono">memory_item</span>, <span className="mono">run</span>,{" "}
            <span className="mono">span</span>, <span className="mono">citation</span>,{" "}
            <span className="mono">approval</span>, <span className="mono">cache_entry</span>,{" "}
            <span className="mono">provider_event</span>, <span className="mono">spend_ledger</span>,{" "}
            <span className="mono">eval_run</span>.
          </p>
          <p>
            Citations are stored <strong>per claim</strong> rather than as a blob, so a reviewer can
            ask which passage supported a specific sentence months later. A citation whose chunk
            does not exist cannot be stored at all — it is a foreign key, and that constraint is the
            point: a citation pointing at nothing is not evidence.
          </p>
          <p>
            The runtime holds no persistent local state. The retrieval index is rebuilt at startup
            rather than cached to disk, which is milliseconds at this corpus size and means a
            container can be replaced without losing anything (NFR-005).
          </p>
          <p className="mono kt-src">apps/agent/migrations/0001_initial.sql</p>
        </Deep>
      </section>

      {/* ═════════════════════════════════════════════════════ 7. delivery */}
      <section className="kt-section">
        <p className="act-label">Seven</p>
        <h3>How it was built, and how that is proven</h3>

        <p>
          By one person directing an AI through a written charter of{" "}
          {council.roles.length} named delivery roles, across nine sprints. One rule does most of
          the work: <strong>a role may not sign off its own work.</strong> The{" "}
          <a href="/council">council page</a> publishes the roster and all {roleReactions} role
          reactions to real defects and decisions.
        </p>
        <p>
          All {delivery.defects.total} defects are published, including the embarrassing ones —{" "}
          {delivery.defects.severityOne} of them severity 1. A delivery record containing only
          successes is not evidence of anything.
        </p>
        <p>
          The governance is enforced rather than described:{" "}
          <strong>a requirement claiming Done while the test it names does not exist fails the
          build.</strong> {delivery.requirements.done} of {delivery.requirements.total} are Done
          under that definition.
        </p>

        <Deep label="The guards, and what each one caught">
          <p>
            Eight checks run on every push, and their unusual property is that they can fail the
            build over <em>documentation</em>, not just code.
          </p>
          <table className="kt-table">
            <thead><tr><th>Guard</th><th>Catches</th></tr></thead>
            <tbody>
              <tr><td className="mono">check-traceability</td><td>A requirement claiming more than the repo can show (D-014)</td></tr>
              <tr><td className="mono">check-readme</td><td>Any figure in the README that disagrees with the derived record (D-015)</td></tr>
              <tr><td className="mono">check-deploy-claims</td><td>A document asserting the app is undeployed after it went live (D-019)</td></tr>
              <tr><td className="mono">check-workflow-shell</td><td>A comment inside a backslash continuation silently truncating a command (D-011)</td></tr>
              <tr><td className="mono">check-sprints</td><td>A sprint number used before its plan exists (D-016)</td></tr>
              <tr><td className="mono">check-docs / check-config / check-secrets</td><td>Stub artefacts, config drift, credentials in a diff</td></tr>
            </tbody>
          </table>
          <p>
            <strong>Each was verified by breaking something and confirming it noticed.</strong> That
            is not ceremony: the first README checker <em>could not fail</em>. It searched for each
            figure as a substring of the whole file, so changing &ldquo;Commits | 54&rdquo; to 99
            still passed, because &ldquo;54&rdquo; appears in &ldquo;54% of questions&rdquo;
            (D-015). A guard that has only been run against a passing tree has not been tested.
          </p>
          <p>
            The most expensive gap was the reverse direction. The traceability guard catches
            over-claiming and nothing caught under-claiming, so{" "}
            <strong>20 requirements sat at Planned while already implemented and passing</strong>{" "}
            (D-020) — found only by an explicit audit. That asymmetry is still open.
          </p>
          <p className="mono kt-src">scripts/check-*.mjs · apps/agent/tests/test_guards_fail_on_bad_input.py</p>
        </Deep>

        <Deep label="The defects worth knowing, and what class each belongs to">
          <table className="kt-table">
            <thead><tr><th>ID</th><th>What</th><th>Class</th></tr></thead>
            <tbody>
              <tr><td className="mono">D-001</td><td>0% false-answer rate reported at a gate; real rate 56.6% on 534 questions</td><td>Test set written by the implementer</td></tr>
              <tr><td className="mono">D-006</td><td>Cache served the previous answer to a correction retry</td><td>Emergent interaction between two individually correct components</td></tr>
              <tr><td className="mono">D-013</td><td>Rate-limit pen test passed while the service was down</td><td>A test written to pass rather than to detect</td></tr>
              <tr><td className="mono">D-018</td><td>CI never built the web app; a major framework bump reported 10/10 green while broken</td><td>A pipeline whose green tick exercises none of the code under change</td></tr>
              <tr><td className="mono">D-021</td><td>Landing page rendered blank without JavaScript, for four sprints</td><td>Motion implemented in JS when CSS already did it</td></tr>
              <tr><td className="mono">D-025</td><td>Local tests passed against a stale build, twice — masking D-024 entirely</td><td>A green run that exercised the previous binary</td></tr>
            </tbody>
          </table>
          <p>
            The distribution is the finding: <strong>not one defect was caught by code review, and
            not one by a unit test written before it.</strong> Every one was caught by executing
            something — the assembled system, a measurement over a large labelled set, a container
            in CI, or a browser.
          </p>
          <p className="mono kt-src">docs/04-quality/DEFECT_LOG.md · <a href="/delivery">the delivery record</a></p>
        </Deep>
      </section>

      {/* ══════════════════════════════════════════════════ 8. operations */}
      <section className="kt-section">
        <p className="act-label">Eight</p>
        <h3>Running it</h3>

        <p>
          Everything runs offline. No API keys, no database and no accounts are needed to clone it
          and run the full test suite.
        </p>
        <pre className="kt-code"><code>{`# the agent and its tests
cd apps/agent
python -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest tests/ -q

# the website: unit, browser, and a local copy
cd apps/web
npm ci
npm run test:unit
npm run test:e2e
npm run dev`}</code></pre>
        <p>
          It costs nothing to run. Every dependency sits on a free tier, and a test fails if a paid
          host ever appears in a deployment manifest.
        </p>

        <Deep label="Deployment topology, and the operational gotchas">
          <table className="kt-table">
            <thead><tr><th>Component</th><th>Where</th><th>Note</th></tr></thead>
            <tbody>
              <tr><td>Website + BFF</td><td className="mono">Vercel, dub1 (Dublin)</td><td>Deployed from <span className="mono">apps/web</span>; not connected to the repo, so publishing is manual</td></tr>
              <tr><td>Agent runtime</td><td className="mono">Northflank, London</td><td>Container binds 7860, <span className="mono">0.0.0.0</span></td></tr>
              <tr><td>Postgres + pgvector</td><td className="mono">Neon, Ireland</td><td>Same region as the functions — cross-region egress is how a free tier stops being free</td></tr>
              <tr><td>Redis + Vector</td><td className="mono">Upstash, Ireland</td><td>Rate limiting and the semantic cache</td></tr>
            </tbody>
          </table>
          <p>
            <strong>ADR-0003 placed the runtime on Hugging Face Spaces &ldquo;because it is
            free&rdquo; and was never checked against the pricing page.</strong> Docker Spaces are
            PRO-only, so three sprints of deployment work targeted a platform that could not host it
            at $0 (D-017). The cost was not a subscription — it was rebuilding the deployment
            decision at the release gate. The charter now requires an ADR depending on a third
            party&rsquo;s pricing to name the page it was read from and the date.
          </p>
          <p>
            Two smaller traps worth carrying forward. <span className="mono">.env</span> values are
            quoted; strip the quotes before pasting into any hosting UI — that caused an auth
            mismatch across eight secrets at once. And Vercel enables Deployment Protection on new
            projects by default, which 302s every route to a login wall.
          </p>
          <p className="mono kt-src">ADR-0012 · deploy/Dockerfile · apps/web/vercel.json</p>
        </Deep>
      </section>

      {/* ══════════════════════════════════════════════════════ 9. handover */}
      <section className="kt-section">
        <p className="act-label">Nine</p>
        <h3>Running the session</h3>

        <p>
          Thirty minutes, with the repository open. Show before you explain — watching it decline is
          more convincing than any description of it declining.
        </p>
        <ol className="kt-agenda">
          <li><span className="mono">0–3</span><span><strong>What it is.</strong> Section one, out loud. No code yet.</span></li>
          <li><span className="mono">3–8</span><span><strong>Show it refusing.</strong> Console → the preset that the corpus cannot answer.</span></li>
          <li><span className="mono">8–13</span><span><strong>Show it recovering.</strong> Break a provider, run again, watch the trace route around it.</span></li>
          <li><span className="mono">13–18</span><span><strong>Show the data.</strong> The data page — especially what the corpus deliberately omits.</span></li>
          <li><span className="mono">18–24</span><span><strong>The defect log.</strong> Land on D-001 and D-021. This is where credibility actually sits.</span></li>
          <li><span className="mono">24–28</span><span><strong>Run the tests.</strong> One command each side. Watching them pass does the work of a lot of talking.</span></li>
          <li><span className="mono">28–30</span><span><strong>What is still open.</strong> Ending on the honest gap is the most in-character thing available.</span></li>
        </ol>

        <h4 className="kt-h4">Questions you will be asked</h4>
        <p><strong>&ldquo;Is the data real?&rdquo;</strong> No, and the site says so on its own page. The engineering, tests, deployment and measurements are real. Anyone who discovers a simulation themselves discounts everything around it.</p>
        <p><strong>&ldquo;Why does it refuse so often?&rdquo;</strong> It defers on 87% of questions, which is the system&rsquo;s largest weakness and is published as one. The signals genuinely overlap; the alternative is answering confidently on evidence that does not support it.</p>
        <p><strong>&ldquo;What would you do next?&rdquo;</strong> Close the one-directional traceability guard, finish release hardening, and generate the last hand-typed document. Naming the gaps unprompted is the entire point.</p>

        <div className="pull" style={{ marginTop: "var(--s7)" }}>
          If you have two minutes: it cites its sources, refuses when it cannot, costs nothing to
          run, has {delivery.tests.total}+ passing tests, and publishes every bug it ever had —
          including one where this page&rsquo;s sibling rendered blank without JavaScript for four
          sprints. The failures are the evidence.
        </div>
      </section>

      {/* ═════════════════════════════════════════════════════ 10. glossary */}
      <section className="kt-section">
        <p className="act-label">Ten</p>
        <h3>Glossary</h3>
        <dl className="kt-glossary">
          {[
            ["Agent", "A program that uses an AI model to work through a task in steps rather than answering in one shot."],
            ["Citation", "A pointer from one sentence to the exact passage supporting it. Pointing at nothing means the sentence is not evidence."],
            ["Retrieval", "Finding relevant passages before answering. Two methods run together: keyword matching and meaning-based matching."],
            ["BM25", "The standard keyword-ranking algorithm. Favours rare terms and short documents."],
            ["Embedding", "A list of numbers representing a piece of text's meaning, so similarity can be measured arithmetically."],
            ["Evidence gate", "The check deciding whether what was found is good enough to answer from. The heart of the system."],
            ["Failover", "When one provider fails, automatically moving to the next in a fixed order."],
            ["Fail closed", "When something breaks, refuse rather than allow. The opposite turns an outage into a bill."],
            ["Semantic cache", "Remembering answers so a rephrased question does not cost another model call."],
            ["ONNX", "A portable model format, so a model trained with heavy tooling can be served without it."],
            ["AUC", "How well a classifier separates two classes. 0.5 is a coin flip, 1.0 is perfect."],
            ["Cross-validation", "Tuning on part of the data and scoring on the part not seen. The difference between a measurement and a memory."],
            ["ADR", "Architecture Decision Record — what was decided, why, and what it cost. Never edited; a reversal is a new one."],
            ["SSE", "Server-Sent Events. A one-way stream letting the browser watch a run happen rather than wait for a result."],
            ["BFF", "Backend For Frontend. The server layer holding credentials the browser must never see."],
            ["Traceability matrix", "The table linking each requirement to the test proving it. A false claim fails the build."],
          ].map(([term, definition]) => (
            <div key={term} className="kt-term">
              <dt className="mono">{term}</dt>
              <dd>{definition}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
