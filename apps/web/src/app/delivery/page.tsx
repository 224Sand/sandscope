import CiStatus from "@/components/CiStatus";
import record from "@/generated/delivery.json";
import config from "@/generated/product.config.json";

export const metadata = { title: `Delivery — ${config.name}` };

/**
 * The delivery record (FR-020 .. FR-024, AC-C12).
 *
 * Every number here is derived by scripts/derive-delivery.mjs from the
 * repository, or read live from the GitHub API. Nothing is typed by hand,
 * because a hand-written test count drifts the moment someone adds a test and
 * forgets, and the entire argument of this page is that its numbers can be
 * checked.
 */

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div>
      <dt className="dim finer">{label}</dt>
      <dd className="mono" style={{ margin: "var(--s1) 0 0", fontSize: "1.5rem", color: "var(--text)" }}>
        {value}
      </dd>
      {note && (
        <p className="dim finest tight-0">{note}</p>
      )}
    </div>
  );
}

export default function Delivery() {
  const loc = record.lines;
  const code = loc.agent + loc.tests + loc.web + loc.tooling;

  return (
    <main className="voice-proof wrap surface">
      <header className="mb-7">
        <p className="mono eyebrow-p" >
          {config.wordmark} / DELIVERY
        </p>
        <h2 className="mb-4">The record, not the claim</h2>
        <p className="muted">
          Every number on this page is derived from the repository at build time or read
          live from the GitHub API. None is typed by hand. The defects are published
          including the ones that were embarrassing, because a delivery record containing
          only successes is not evidence of anything.
        </p>
        <p className="mono dim finest mt-4" >
          derived at {record.generatedAt} from {record.sha}
        </p>
      </header>

      <section className="panel mb-6" >
        <h3 className="mb-5">Continuous integration, live</h3>
        <CiStatus />
        <p className="note">
          Every push runs governance gates, lint, strict type checking, the offline suite,
          integration tests against a real Postgres with pgvector, a statistics suite
          checked against scikit-learn and scipy, a smoke test of the assembled system,
          and both evaluation suites. A red pipeline blocks merge.
        </p>
      </section>

      <section className="panel mb-6" >
        <h3 className="mb-5">Scale</h3>
        <dl className="stat-grid">
          <Stat label="commits" value={record.commits} />
          <Stat
            label="test functions"
            value={record.tests.total}
            note={`across ${record.tests.files} files; pytest reports more because of parametrised expansion`}
          />
          <Stat label="lines of code" value={code.toLocaleString()} note="excluding dependencies and generated files" />
          <Stat label="lines of documentation" value={record.docs.lines.toLocaleString()} note={`${record.docs.files} documents`} />
          <Stat label="code to docs" value={`${(code / record.docs.lines).toFixed(1)}:1`} />
          <Stat label="architecture decisions" value={record.adrs.length} />
        </dl>
      </section>

      <section className="panel mb-6" >
        <h3 className="mb-3">Defects</h3>
        <p className="para-mb5">
          {record.defects.total} found and fixed during the build, {record.defects.severityOne} of
          them severity one. Every one is guarded by a regression test. <strong>None was found
          by code review.</strong>
        </p>
        <div className="scroll-x-auto">
          <table className="data-table">
            <thead>
              <tr className="dim">
                {["id", "sev", "what broke", "root cause"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {record.defects.entries.map((defect) => (
                <tr key={defect.id} className="hairline-top muted">
                  <td className="mono nowrap">
                    {defect.id}
                  </td>
                  <td>
                    <span style={{ color: defect.severity === "1" ? "var(--blocked)" : "var(--text-3)" }}>
                      {defect.severity}
                    </span>
                  </td>
                  <td className="ink">
                    {defect.description}
                  </td>
                  <td>{defect.cause}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel mb-6" >
        <h3 className="mb-3">Requirements</h3>
        <p className="para-mb5">
          {record.requirements.total} requirements, each traced to a story and a named test.
          A requirement with no test fails the build — the gate refuses to pass rather than
          warning, so the traceability matrix cannot quietly go stale.
        </p>
        <dl className="stat-grid">
          <Stat label="total" value={record.requirements.total} />
          <Stat label="delivered" value={record.requirements.done} />
          <Stat label="planned" value={record.requirements.planned} />
        </dl>

        {/* FR-021: the matrix itself, not a summary of it.
            Three aggregate numbers told a reader that 46 of 58 were done and
            gave them no way to ask WHICH, or what test any one rests on —
            which is the only question that makes the claim checkable. Every
            row is derived from TRACEABILITY.md at build time. */}
        <hr className="hairline rule-65"/>
        <details className="matrix-details">
          <summary className="matrix-summary">
            Show all {record.requirements.total} requirements, with the test each one names
          </summary>
          <div className="tablewrap mt-4" >
            <table className="matrix-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Requirement</th>
                  <th>Test</th>
                  <th>Sprint</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {record.requirements.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="mono nowrap dim" >
                      {row.id}
                    </td>
                    <td>{row.requirement}</td>
                    <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>
                      {row.test}
                    </td>
                    <td className="mono dim">{row.sprint}</td>
                    <td>
                      <span
                        className={
                          row.status === "Done" ? "chip chip--grounded" : "chip chip--neutral"
                        }
                      >
                        {row.status.toLowerCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="panel mb-6" >
        <h3 className="mb-5">Sprints</h3>
        <ul className="plain-list">
          {record.sprints.map((sprint) => (
            <li
              key={sprint.number}
              style={{ display: "grid", gridTemplateColumns: "4ch 1fr 8ch 1fr", gap: "var(--s3)", padding: "var(--s2) 0", borderBottom: "1px solid var(--line)" }}
            >
              <span className="mono dim">{sprint.number}</span>
              <span className="ink">{sprint.name}</span>
              <span className="mono dim finer">{sprint.release}</span>
              <span className="mono muted finer" >{sprint.velocity}</span>
            </li>
          ))}
        </ul>
        <p className="note">
          Ceremonies map to work sessions rather than calendar days, and that mapping is
          disclosed here rather than dressed up as a two-week cadence. Faking the calendar
          would have made every number on this page fiction.
        </p>
      </section>

      {/* FR-023: decision records rendered WITH context and consequences.
          This was a list of titles linking to GitHub — a bibliography, not a
          decision record. The point of an ADR is the reasoning and what it
          cost; a reader who has to leave the site to find either has been
          shown that the ADRs exist, not what they say. Both sections are
          derived from the markdown at build time, so they cannot drift from
          the files they summarise. */}
      <section className="panel">
        <h3 className="mb-3">Architecture decisions</h3>
        <p className="para-mb5">
          {record.adrs.length} records. Each is immutable once accepted — a reversal is a new
          record that supersedes it, never an edit — and each carries what it cost, because a
          decision log that only records upside is a marketing document.
        </p>
        <div className="stack-3">
          {record.adrs.map((adr) => (
            <details key={adr.file} className="adr">
              <summary className="adr-summary">
                <span className="mono adr-id">{adr.file.slice(0, 4)}</span>
                <span className="adr-title">{adr.title.replace(/^ADR-\d+\s*—\s*/, "")}</span>
                <span
                  className={
                    adr.status.toLowerCase() === "accepted"
                      ? "chip chip--grounded"
                      : "chip chip--neutral"
                  }
                >
                  {adr.status.toLowerCase()}
                </span>
              </summary>
              <div className="adr-body">
                <h4 className="adr-h">Context</h4>
                <p className="adr-p">{adr.context}</p>
                <h4 className="adr-h">Decision</h4>
                <p className="adr-p">{adr.decision}</p>
                <h4 className="adr-h">Consequences</h4>
                <p className="adr-p">{adr.consequences}</p>
                <a
                  className="mono adr-link"
                  href={`https://github.com/${record.repo}/blob/main/docs/03-architecture/adr/${adr.file}`}
                >
                  read the full record →
                </a>
              </div>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
