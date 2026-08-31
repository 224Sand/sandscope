import data from "@/generated/dataset.json";
import config from "@/generated/product.config.json";

export const metadata = { title: `The data — ${config.name}` };

/**
 * Everything this system reasons about, published (FR-031).
 *
 * The site has always said the corpus, the estate and the incidents are
 * synthetic. It said it in one sentence, and a reader had no way to see WHAT
 * was invented, how much of it there is, or how the 715 evaluation questions
 * were built. "Synthetic" without an inventory is indistinguishable from
 * "vague", and the whole argument of this project is that its claims can be
 * checked.
 *
 * Every number here comes from `dataset.json`, exported from the corpus and the
 * generators themselves; `test_dataset_summary_is_current` fails the build if
 * that file stops describing the corpus that exists.
 */

const KIND_LABEL: Record<string, string> = {
  arch: "Architecture",
  pol: "Policy",
  pm: "Postmortem",
  rb: "Runbook",
};

function Stat({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div>
      <div className="mono stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

export default function DataPage() {
  const { corpus, estate, faults, questions } = data;
  const answerablePct = Math.round((questions.answerable / questions.total) * 100);

  return (
    <main className="voice-proof wrap surface">
      <header style={{ marginBottom: "var(--s7)" }}>
        <p className="mono" style={{ color: "var(--text-3)", marginBottom: "var(--s3)" }}>
          {config.wordmark} / DATA
        </p>
        <h2 style={{ marginBottom: "var(--s4)" }}>Everything here is invented. Here is all of it.</h2>
        <p style={{ color: "var(--text-2)", fontSize: "1.0625rem", maxWidth: "70ch" }}>
          There is no real company behind {config.wordmark}. The services, the documents, the
          incidents and the metrics were all authored for this project. That is stated on every
          other surface in one sentence — this page is the inventory behind the sentence, because a
          claim of &ldquo;synthetic&rdquo; that cannot be inspected is just a claim.
        </p>
        <p style={{ color: "var(--text-3)", fontSize: "0.9375rem", marginTop: "var(--s4)", maxWidth: "70ch" }}>
          No document, service or question below was written by a language model. The estate
          topology is hand-authored; the telemetry and incidents are generated from a seed, so any
          run can be reproduced exactly rather than described.
        </p>
      </header>

      <section className="reveal-scale story-stats" style={{ marginBottom: "var(--s8)" }}>
        <Stat value={String(corpus.documents)} label="Documents" note={`${corpus.chunks} passages`} />
        <Stat value={String(estate.services)} label="Services" note={`${estate.dependencies} dependencies`} />
        <Stat value={String(faults.length)} label="Fault patterns" note="each with a runbook" />
        <Stat value={String(questions.total)} label="Labelled questions" note={`${answerablePct}% answerable`} />
        <Stat value={String(corpus.words.toLocaleString())} label="Words of corpus" note="hand-written" />
      </section>

      {/* ------------------------------------------------------------ corpus */}
      <section className="panel" style={{ marginBottom: "var(--s6)" }}>
        <h3 style={{ marginBottom: "var(--s3)" }}>The document library</h3>
        <p style={{ color: "var(--text-2)", marginBottom: "var(--s5)", maxWidth: "70ch" }}>
          This is the entire world the agent can reason from. {corpus.documents} documents,{" "}
          {corpus.words.toLocaleString()} words, split into {corpus.chunks} passages — every
          citation the system emits points at one of these. It is deliberately small: a corpus you
          can read in an afternoon is one where you can verify the agent&rsquo;s answers yourself.
        </p>
        <div className="tablewrap">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Document</th>
                <th>Title</th>
                <th>Words</th>
                <th>Passages</th>
              </tr>
            </thead>
            <tbody>
              {corpus.files.map((file) => (
                <tr key={file.id}>
                  <td style={{ whiteSpace: "nowrap", color: "var(--text-3)" }}>
                    {KIND_LABEL[file.id.split("-")[0] ?? ""] ?? "—"}
                  </td>
                  <td className="mono" style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                    {file.id}
                  </td>
                  <td>{file.title}</td>
                  <td className="mono dim">{file.words}</td>
                  <td className="mono dim">{file.chunks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* -------------------------------------------------------------- gaps */}
      <section className="panel" style={{ marginBottom: "var(--s6)", borderColor: "color-mix(in srgb, var(--refused) 35%, var(--line))" }}>
        <h3 style={{ marginBottom: "var(--s3)" }}>What the corpus deliberately does NOT cover</h3>
        <p style={{ color: "var(--text-2)", marginBottom: "var(--s4)", maxWidth: "70ch" }}>
          The most load-bearing file in the dataset is a list of things it leaves out. Without
          verified gaps, &ldquo;correct refusal&rdquo; cannot be measured at all — every refusal
          would count as a mistake, and the refusal threshold could be set to zero without any test
          noticing.
        </p>
        <p style={{ color: "var(--text-2)", marginBottom: "var(--s4)", maxWidth: "70ch" }}>
          Twelve topics are absent outright: disk exhaustion, DNS failures, data retention, on-call
          rotas, disaster recovery, feature flags and more. Six more are the harder case —{" "}
          <strong>partially</strong> covered, where retrieval happily returns adjacent material. A
          weak system answers those from context that is about something else.
        </p>
        <p className="mono" style={{ color: "var(--refused)", fontSize: "0.875rem", marginBottom: "var(--s4)" }}>
          A system that answers any row in that table has failed, and the failure is specifically
          the one this product exists to prevent.
        </p>
        <p style={{ color: "var(--text-3)", fontSize: "0.875rem", maxWidth: "70ch" }}>
          The gap list also carries a correction, kept visible: one entry claimed the corpus
          couldn&rsquo;t say who approves an emergency change. It can. The evidence gate scored it
          answerable, the author had marked it unanswerable, and the author was wrong. It is
          recorded rather than quietly deleted, because a gap list is itself a claim about the
          corpus.
        </p>
        <a
          className="mono"
          style={{ fontSize: "0.8125rem", display: "inline-block", marginTop: "var(--s4)" }}
          href={`https://github.com/${config.repo}/blob/main/apps/agent/corpus/GAPS.md`}
        >
          read the full gap list →
        </a>
      </section>

      {/* ------------------------------------------------------------ estate */}
      <section className="panel" style={{ marginBottom: "var(--s6)" }}>
        <h3 style={{ marginBottom: "var(--s3)" }}>The invented company</h3>
        <p style={{ color: "var(--text-2)", marginBottom: "var(--s5)", maxWidth: "70ch" }}>
          {estate.services} services across {Object.keys(estate.byTier).length} criticality tiers,
          owned by {estate.teams.length} teams, wired together by {estate.dependencies} real
          dependencies. The topology is <strong>authored, not generated</strong> — a randomly wired
          graph produces plausible names and an implausible shape, and incident causality is only
          interesting when the topology is.
        </p>
        <p style={{ color: "var(--text-3)", fontSize: "0.875rem", marginBottom: "var(--s5)" }}>
          Tier 0 is on the customer&rsquo;s critical path right now. Tier 3 can be down for an hour
          before anyone outside the owning team notices.
        </p>
        <div className="tablewrap">
          <table className="matrix-table">
            <thead>
              <tr><th>Service</th><th>Tier</th><th>Runtime</th><th>Owning team</th></tr>
            </thead>
            <tbody>
              {estate.rows.map((service) => (
                <tr key={service.id}>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{service.name}</td>
                  <td>
                    <span className={service.tier === 0 ? "chip chip--blocked" : "chip chip--neutral"}>
                      tier {service.tier}
                    </span>
                  </td>
                  <td className="mono dim finest">
                    {service.runtime}
                  </td>
                  <td className="muted">{service.team}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------------------------------------------ faults */}
      <section className="panel" style={{ marginBottom: "var(--s6)" }}>
        <h3 style={{ marginBottom: "var(--s3)" }}>The things that go wrong</h3>
        <p style={{ color: "var(--text-2)", marginBottom: "var(--s5)", maxWidth: "70ch" }}>
          {faults.length} fault patterns, each describing a real failure mode, the metrics that
          identify it, and the runbook that covers it. An incident is generated by choosing a
          pattern and a service that can actually exhibit it — the root service moves first, and
          services in its blast radius move later, attenuated by distance in the dependency graph.
          That time ordering is the diagnostic signal the agent has to reason from.
        </p>
        <div style={{ display: "grid", gap: "var(--s3)" }}>
          {faults.map((fault) => (
            <div key={fault.id} style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--s3)" }}>
              <div style={{ display: "flex", gap: "var(--s3)", alignItems: "baseline", flexWrap: "wrap" }}>
                <span className={fault.severity === 1 ? "chip chip--blocked" : "chip chip--neutral"}>
                  sev {fault.severity}
                </span>
                <strong style={{ fontSize: "0.9375rem" }}>{fault.name}</strong>
                <span className="mono dim finest">
                  {fault.runbook}
                </span>
              </div>
              <p style={{ color: "var(--text-2)", fontSize: "0.9375rem", margin: "var(--s2) 0 var(--s2)", maxWidth: "72ch" }}>
                {fault.summary}
              </p>
              <p className="mono" style={{ color: "var(--text-3)", fontSize: "0.75rem", margin: 0 }}>
                {fault.signals.join(" · ")}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- questions */}
      <section className="panel">
        <h3 style={{ marginBottom: "var(--s3)" }}>The {questions.total} questions</h3>
        <p style={{ color: "var(--text-2)", marginBottom: "var(--s4)", maxWidth: "70ch" }}>
          Every threshold in the refusal gate is set against these. {questions.answerable} have an
          answer in the corpus and {questions.unanswerable} deliberately do not — and the label is{" "}
          <strong>true by construction</strong> rather than assigned by a person or a model. An
          answerable question is generated FROM the passage that answers it, so the passage is the
          answer. An unanswerable one is generated from a topic whose absence is verified against
          the corpus text at generation time.
        </p>
        <p style={{ color: "var(--text-3)", fontSize: "0.875rem", marginBottom: "var(--s6)", maxWidth: "70ch" }}>
          That matters because the alternative is labelling by hand, which produces a set that
          measures the labeller&rsquo;s judgement. It has already gone wrong once here — see the
          correction in the gap list above.
        </p>

        <div style={{ display: "grid", gap: "var(--s5)" }}>
          {questions.mechanisms.map((mechanism) => (
            <div key={mechanism.id} style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--s4)" }}>
              <div style={{ display: "flex", gap: "var(--s3)", alignItems: "baseline", flexWrap: "wrap", marginBottom: "var(--s2)" }}>
                <span className="mono" style={{ fontSize: "1.125rem", color: "var(--text)" }}>
                  {mechanism.count}
                </span>
                <span className={mechanism.label === "answerable" ? "chip chip--grounded" : "chip chip--refused"}>
                  {mechanism.label}
                </span>
                <span className="mono dim finest">
                  {mechanism.id.replace(/_/g, " ")}
                </span>
              </div>
              <p style={{ color: "var(--text-2)", fontSize: "0.9375rem", marginBottom: "var(--s3)", maxWidth: "72ch" }}>
                {mechanism.note}
              </p>
              <p className="mono" style={{ color: "var(--text-3)", fontSize: "0.8125rem", margin: 0, paddingLeft: "var(--s4)", borderLeft: "2px solid var(--line)" }}>
                &ldquo;{mechanism.example}&rdquo;
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
