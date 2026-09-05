import config from "@/generated/product.config.json";

export const metadata = {
  title: `Charter — ${config.name}`,
  description:
    "An MCP server that makes an AI coding agent work as a governed team of senior " +
    "specialists: each role must produce a machine-checkable artifact before it may sign off.",
};

const REPO = "https://github.com/224Sand/charter";

/**
 * Charter's own page (product, not retrospective).
 *
 * /council documents how THIS repository was governed. Charter is the tool that
 * discipline turned into, extracted and made enforceable. The two are linked
 * rather than merged: one is evidence about SandScope, the other is something a
 * visitor can install.
 *
 * Every command, version and count below was verified against a clean `uvx`
 * install from the public repository before being published. Nothing here is a
 * claim the reader cannot reproduce in a terminal.
 */

const CONTRACTS: [string, string, string, string][] = [
  [
    "QA",
    "failing_test",
    "runs the named test and rejects it unless it genuinely fails",
    "A test that passes is not evidence of a defect.",
  ],
  [
    "Developer",
    "change_summary",
    "rejects a summary citing files that do not exist",
    "The change has to point at real code.",
  ],
  [
    "AppSec",
    "threat_entry",
    "requires a CWE identifier and a concrete attack path",
    "“Consider validating input” has never stopped an exploit.",
  ],
];

export default function CharterPage() {
  return (
    <main className="voice-product wrap surface">
      <header className="mb-7">
        <p className="mono eyebrow-p">{config.wordmark} / CHARTER</p>
        <h2 className="mb-4">Your coding agent, working as a team that can tell you no</h2>
        <p className="lede-lg">
          Claude Code, Cursor and Codex are competent generalists. On a real build, one voice
          writes the code, reviews the code, tests the code, and declares it done. Charter makes
          that voice work as named specialists instead — and enforces the separation rather than
          suggesting it.
        </p>
        <div className="pull rule-y">A role may not sign off its own work.</div>
        <p style={{ color: "var(--text-2)", maxWidth: "70ch" }}>
          That rule governed this repository first. Charter is that discipline extracted into an
          MCP server, where the checks are executed instead of asked for. It is open source, runs
          entirely on your machine, and has no accounts, telemetry or paid tier.
        </p>
      </header>

      {/* ------------------------------------------------------------ install */}
      <section className="panel mb-6">
        <h3 className="mb-3">Install</h3>
        <p className="lede-p">
          In Claude Code, one step — it installs the server <em>and</em> the skill that drives it:
        </p>
        <pre className="kt-code">
          {`/plugin marketplace add 224Sand/charter\n/plugin install charter@charter`}
        </pre>
        <p className="para" style={{ color: "var(--text-2)" }}>
          Both halves matter. An MCP server only answers when asked; it cannot push. Something has
          to tell your agent to keep calling <code>charter_next</code> until the build is done, and
          that is the bundled skill. Install the server alone and you get four tools nobody calls.
        </p>

        <h4 className="mb-2 mt-6">Cursor, Codex, or any MCP client</h4>
        <pre className="kt-code">
          {`{ "mcpServers": { "charter": { "command": "uvx", "args": [
    "--from", "git+https://github.com/224Sand/charter", "charter", "serve" ] } } }`}
        </pre>
        <p className="para" style={{ color: "var(--text-2)" }}>
          Then generate the skill yourself, because nothing else will:
        </p>
        <pre className="kt-code">{`charter gen-skill --dest .claude/skills/charter`}</pre>
        <p className="footnote">
          The skill is rendered from the same role definitions the server enforces, so the
          instructions your agent reads and the rules it is held to cannot drift apart. That is
          checked in CI, not asserted.
        </p>
      </section>

      {/* ---------------------------------------------------------------- use */}
      <section className="panel mb-6">
        <h3 className="mb-3">Using it</h3>
        <pre className="kt-code">
          {`charter init "Fix SQL injection in login()"   # derives the roster\ncharter status                                 # who signed off, who is outstanding`}
        </pre>
        <p className="lede-p">Then your agent runs the loop:</p>
        <ul className="kt-agenda">
          <li>
            <span className="mono">next</span>
            <span>
              <strong>Charter names the role.</strong> It returns that role&rsquo;s brief, the
              artifact under review, and the contract owed — about a kilobyte, never a tour of your
              repository.
            </span>
          </li>
          <li>
            <span className="mono">work</span>
            <span>
              <strong>Your agent does the job</strong> with its own tools, in that role, and opens
              the cited files itself.
            </span>
          </li>
          <li>
            <span className="mono">submit</span>
            <span>
              <strong>Charter checks the evidence.</strong> Not the prose — it runs the test,
              resolves the paths, reads the CWE. Three failures escalate to you rather than looping.
            </span>
          </li>
          <li>
            <span className="mono">done</span>
            <span>
              <strong>Only when the defect actually stops.</strong> Charter re-runs the test QA
              filed before it will close a build.
            </span>
          </li>
        </ul>
        <p className="footnote">
          Order is red before green: QA proves the defect exists, the developer answers it, AppSec
          reviews the result. A reviewing role must run from its own charter session — charter
          refuses a review submitted by the process that produced the work.
        </p>
      </section>

      {/* ---------------------------------------------------------- contracts */}
      <section className="panel mb-6">
        <h3 className="mb-3">What a role owes</h3>
        <p className="lede-p">
          Prose can be copied and faked. A contract cannot: charter validates the artifact, and
          refuses the sign-off when it does not hold.
        </p>
        <div className="tablewrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="th-pad">Role</th>
                <th className="th-pad">Contract</th>
                <th className="th-pad">Charter rejects when</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACTS.map(([role, contract, rejects, why]) => (
                <tr key={role}>
                  <td className="cell"><strong>{role}</strong></td>
                  <td className="cell"><code className="mono">{contract}</code></td>
                  <td className="cell">
                    {rejects}
                    <span className="fine" style={{ display: "block", marginTop: "0.25rem" }}>
                      {why}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="footnote">
          The build record lives in <code className="mono">.charter/</code> — human-readable,
          git-diffable, append-only. A session with no prior context resumes the build from those
          files alone, which is what makes a build survive across days and compaction.
        </p>
      </section>

      {/* -------------------------------------------------------- honest bit */}
      <section className="panel mb-6">
        <h3 className="mb-3">What it proves, and what it does not</h3>
        <p className="lede-p">
          Charter stamps every server connection with an id the caller cannot set, records it on
          each sign-off, and refuses a review submitted from the same connection that produced the
          work.
        </p>
        <p className="para" style={{ color: "var(--text-2)" }}>
          That proves a sign-off came from a <strong>separate process</strong>, and that it carries
          its own checkable artifact. It does <strong>not</strong> prove independent reasoning. A
          server restart, an agent deliberately restarting it, or a person clicking through two
          sessions without reading all satisfy the mechanism.
        </p>
        <p className="para" style={{ color: "var(--text-2)" }}>
          The artifact contract carries the weight. Identity raises the cost of collapsing the
          roles; it does not make it impossible. Charter says this in its own status output, its
          skill and its README, because a governance tool that overstates its guarantee is the
          first thing that should not be trusted.
        </p>
      </section>

      {/* ------------------------------------------------------- self-audits */}
      <section className="panel mb-6">
        <h3 className="mb-3">It was run against its own codebase. Twice.</h3>
        <p className="lede-p">
          A tool that governs code review is easy to demo and easy to fake. Both runs are published
          with the rejections left in.
        </p>
        <div className="stat-grid mb-5">
          <div>
            <div className="stat-value">3</div>
            <div className="stat-label">defects found in charter itself</div>
          </div>
          <div>
            <div className="stat-value">2</div>
            <div className="stat-label">filed by roles the author did not control</div>
          </div>
          <div>
            <div className="stat-value">121</div>
            <div className="stat-label">tests, each guard verified by removing it</div>
          </div>
        </div>
        <ul className="plain-list">
          <li>
            <strong>The first run did not finish.</strong> Charter refused a submission it could not
            verify, then refused a test that proved nothing. That rejection exposed a dependency
            bug that would have broken every fresh install, and its QA pass found a flaw in
            charter&rsquo;s own loop ordering.
          </li>
          <li>
            <strong>The second run completed</strong> — three distinct connections, zero rejections
            — and its AppSec pass filed a CWE-94 against the change the developer had just written.
            The build closed with that finding accepted, because the contract requires a finding be
            produced, not that it be empty. It was fixed rather than shipped.
          </li>
        </ul>
        <p className="footnote">
          Both records:{" "}
          <a href={`${REPO}/tree/master/docs/self-audit`}>docs/self-audit</a>. The governance trail
          of this repository, which charter was extracted from, is on the{" "}
          <a href="/council">council page</a>.
        </p>
      </section>

      {/* ------------------------------------------------- roles keep growing */}
      <section className="panel mb-6">
        <h3 className="mb-3">The roster keeps growing, and updates reach you</h3>
        <p className="lede-p">
          Charter ships with QA, Developer and AppSec because those three have the sharpest
          checkable contracts. The roster is not the product — the enforcement is. Roles are plain
          YAML, and the kernel enforces whatever they declare.
        </p>
        <pre className="kt-code">
          {`# src/charter/kernel/definitions/roles/architect.yaml
id: architect
name: Solutions Architect
contract: decision_record
evidence: tree
activates_on: [scrum, cicd]
brief: >-
  Owns the shape of the system across components. Suspicious of a decision
  record that lists only advantages.`}
        </pre>
        <p className="para" style={{ color: "var(--text-2)" }}>
          New roles ship inside a released version, so you pick them up the same way you picked up
          charter — by updating the plugin. Nothing phones home to fetch them, and nothing executes
          a role definition you did not install: the library is read from the package on disk, which
          is why the roster can grow without becoming a remote-code channel.
        </p>
        <pre className="kt-code">{`uvx --refresh --from git+https://github.com/224Sand/charter charter --help`}</pre>
        <p className="footnote">
          Fork it and the same applies to your own roster — a Legal reviewer on a fintech repo, a
          Localization lead on a multi-region product. Write the brief and the contract; the gates,
          the record and the independence check work unchanged.
        </p>
      </section>

      <section className="panel">
        <h3 className="mb-3">Source</h3>
        <p className="lede-p">
          MIT. Fork it, add roles, point it at your own process — the role library is plain YAML and
          the kernel enforces whatever it declares.
        </p>
        <p className="para">
          <a href={REPO}>github.com/224Sand/charter</a>
        </p>
      </section>
    </main>
  );
}
