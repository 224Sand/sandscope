import council from "@/generated/council.json";
import config from "@/generated/product.config.json";

export const metadata = { title: `The council — ${config.name}` };

/**
 * How this project was actually governed (FR-032).
 *
 * The charter has existed since Sprint 0 and the retrospective since Sprint 8,
 * and neither was visible anywhere on the site — the story page asserted that
 * twelve named roles built this, with the documents behind it in the repo. An
 * unverifiable claim about process is exactly the kind of thing this project
 * spends its whole argument refusing to make.
 *
 * So the roster, the authority model and every role reaction are parsed from
 * WAYS_OF_WORKING.md and COUNCIL_RETROSPECTIVE.md at build time. Nothing here
 * is retyped: a hand-maintained copy of a governance document is a second
 * source of truth for the thing most needing one source of, and this repo has
 * been bitten by exactly that three times (D-014, D-019, D-020).
 */

export default function CouncilPage() {
  const reactions = council.artifacts.reduce((total, a) => total + a.reactions.length, 0);
  const voices = new Set(council.artifacts.flatMap((a) => a.reactions.map((r) => r.role)));

  return (
    <main className="voice-proof wrap" style={{ paddingTop: "var(--s8)", paddingBottom: "var(--s10)" }}>
      <header style={{ marginBottom: "var(--s7)" }}>
        <p className="mono" style={{ color: "var(--text-3)", marginBottom: "var(--s3)" }}>
          {config.wordmark} / COUNCIL
        </p>
        <h2 style={{ marginBottom: "var(--s4)" }}>One person, twelve roles, and a rule that made it work</h2>
        <p style={{ color: "var(--text-2)", fontSize: "1.0625rem", maxWidth: "70ch" }}>
          This was built by one person directing an AI through a written charter of named delivery
          roles. That arrangement collapses into a single agreeable voice unless something stops
          it, and one rule does most of that work:
        </p>
        <div className="pull" style={{ margin: "var(--s5) 0" }}>A role may not sign off its own work.</div>
        <p style={{ color: "var(--text-2)", maxWidth: "70ch" }}>
          The evidence that it held is below: {reactions} reactions from {voices.size} different
          roles across {council.artifacts.length} real decisions and defects, every one citing an
          artefact in this repository. Where roles agreed, it says so. Where they disagreed, that is
          the interesting part and it is printed rather than smoothed over.
        </p>
      </header>

      {/* ------------------------------------------------------------- roster */}
      <section className="panel" style={{ marginBottom: "var(--s6)" }}>
        <h3 style={{ marginBottom: "var(--s3)" }}>The delivery roster</h3>
        <p style={{ color: "var(--text-2)", marginBottom: "var(--s5)", maxWidth: "70ch" }}>
          {council.roles.length} roles, each owning something specific and producing something
          named. A role that owns nothing produces nothing, and a role that produces nothing is a
          label rather than a function.
        </p>
        <div className="tablewrap">
          <table className="matrix-table">
            <thead>
              <tr><th>Role</th><th>Owns</th><th>Produces</th></tr>
            </thead>
            <tbody>
              {council.roles.map((role) => (
                <tr key={role.role}>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 590 }}>{role.role}</td>
                  <td style={{ color: "var(--text-2)" }}>{role.owns}</td>
                  <td style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>{role.produces}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* -------------------------------------------------------- stakeholders */}
      <section className="panel" style={{ marginBottom: "var(--s6)" }}>
        <h3 style={{ marginBottom: "var(--s3)" }}>Where the human sits</h3>
        <p style={{ color: "var(--text-2)", marginBottom: "var(--s5)", maxWidth: "70ch" }}>
          The person directing this is not a spectator on it. Every message they send is classified
          into one of these roles on receipt, because the same sentence carries different authority
          depending on which hat it arrives under — &ldquo;the font looks wrong&rdquo; is an
          observation, &ldquo;don&rsquo;t ship until security passes&rdquo; is an instruction.
        </p>
        <div className="tablewrap">
          <table className="matrix-table">
            <thead>
              <tr><th>Role</th><th>When it applies</th><th>Authority</th></tr>
            </thead>
            <tbody>
              {council.stakeholders.map((role) => (
                <tr key={role.role}>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 590 }}>{role.role}</td>
                  <td style={{ color: "var(--text-2)" }}>{role.when}</td>
                  <td style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>{role.authority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* --------------------------------------------------------- the review */}
      <section style={{ marginBottom: "var(--s6)" }}>
        <h3 style={{ marginBottom: "var(--s3)" }}>The review, artefact by artefact</h3>
        <p style={{ color: "var(--text-2)", marginBottom: "var(--s6)", maxWidth: "70ch" }}>
          Each entry is a real defect or decision from this repository, with what every role
          actually said about it. A role that had nothing genuine to say about a given artefact is
          absent rather than padded in — a committee where everyone comments on everything is a
          committee producing filler.
        </p>

        <div style={{ display: "grid", gap: "var(--s5)" }}>
          {council.artifacts.map((artifact) => (
            <article key={artifact.number} className="panel">
              <div style={{ display: "flex", gap: "var(--s3)", alignItems: "baseline", flexWrap: "wrap", marginBottom: "var(--s3)" }}>
                <span className="mono" style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>
                  {String(artifact.number).padStart(2, "0")}
                </span>
                <h4 style={{ fontSize: "1.0625rem", margin: 0, flex: 1, minWidth: "16rem" }}>
                  {artifact.title}
                </h4>
                {artifact.citations.map((citation) => (
                  <span key={citation.label} className="chip chip--neutral">{citation.label}</span>
                ))}
              </div>

              <p style={{ color: "var(--text-2)", fontSize: "0.9375rem", marginBottom: "var(--s5)", maxWidth: "74ch" }}>
                {artifact.what}
              </p>

              <div style={{ display: "grid", gap: "var(--s4)" }}>
                {artifact.reactions.map((reaction) => (
                  <div key={reaction.role} style={{ paddingLeft: "var(--s4)", borderLeft: "2px solid var(--line)" }}>
                    <p className="mono" style={{ fontSize: "0.75rem", color: "var(--accent)", margin: "0 0 var(--s1)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {reaction.role}
                    </p>
                    <p style={{ color: "var(--text-2)", fontSize: "0.9375rem", margin: 0, maxWidth: "72ch" }}>
                      {reaction.text}
                    </p>
                  </div>
                ))}
              </div>

              {artifact.diverged && (
                <p style={{ color: "var(--text-3)", fontSize: "0.875rem", marginTop: "var(--s5)", paddingTop: "var(--s4)", borderTop: "1px solid var(--line)", maxWidth: "74ch" }}>
                  <span className="mono" style={{ color: "var(--refused)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: "var(--s2)" }}>
                    where they diverged
                  </span>
                  {artifact.diverged}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ the tool */}
      <section className="panel">
        <h3 style={{ marginBottom: "var(--s3)" }}>The review process became a tool</h3>
        <p style={{ color: "var(--text-2)", marginBottom: "var(--s4)", maxWidth: "70ch" }}>
          Partway through, it became clear the discipline above was worth extracting: pick the
          methodology first, because Scrum has no Change Control Board and Waterfall has no
          retrospective, and a role set chosen before a methodology produces a committee that
          cannot decide anything. Then name a role before each action rather than after, so it
          constrains the work instead of labelling it.
        </p>
        <p style={{ color: "var(--text-2)", marginBottom: "var(--s4)", maxWidth: "70ch" }}>
          That became <strong>role-council</strong>, an open-source skill that runs this review over
          any repository&rsquo;s real history — mining defect logs, decision records and commits
          rather than inventing opinions. Everything on this page is its first real output, run
          against the project that produced it.
        </p>
        <p style={{ color: "var(--text-3)", fontSize: "0.875rem", maxWidth: "70ch", marginBottom: "var(--s4)" }}>
          Its most important rule is the one it is easiest to break: never invent the disagreement.
          If a claim cannot be cited it is dropped rather than dressed up, because manufactured
          conflict is exactly as useless as manufactured consensus.
        </p>
        <div style={{ display: "flex", gap: "var(--s4)", flexWrap: "wrap" }}>
          <a className="mono" style={{ fontSize: "0.8125rem" }} href="https://github.com/224Sand/role-council">
            github.com/224Sand/role-council →
          </a>
          <a className="mono" style={{ fontSize: "0.8125rem" }} href={`https://github.com/${config.repo}/blob/main/docs/00-governance/WAYS_OF_WORKING.md`}>
            the charter →
          </a>
          <a className="mono" style={{ fontSize: "0.8125rem" }} href={`https://github.com/${config.repo}/blob/main/docs/00-governance/COUNCIL_RETROSPECTIVE.md`}>
            the full retrospective →
          </a>
        </div>
      </section>
    </main>
  );
}
