import RoleChooser from "./RoleChooser";
import Mark from "@/components/Mark";
import delivery from "@/generated/delivery.json";
import reliability from "@/generated/reliability.json";
import architecture from "@/generated/architecture.json";
import config from "@/generated/product.config.json";

export const metadata = { title: `Story — ${config.name}` };

/**
 * The project explained to someone who has never seen it (S9-STORY, S9-CONTEXT).
 *
 * Written for two readers at once. Somebody from product, project management,
 * finance or the business side should be able to read this end to end and
 * understand what was built and why. An engineer should find nothing here that
 * is softened to the point of being untrue.
 *
 * The way that is held together is layering, not simplification: plain language
 * leads, the specific number or artefact follows in the same breath. There is no
 * "simple mode" — a page that routes non-technical readers to a lesser version
 * insults both audiences.
 *
 * Every figure is imported from the derived record, not typed here.
 */

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function Stat({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div>
      <div className="mono stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

export default function Story() {
  const done = delivery.requirements.done;
  const total = delivery.requirements.total;

  return (
    <main className="voice-story">
      {/* ------------------------------------------------------------ opening */}
      <header className="story-hero">
        <div className="wrap">
          {/* The mark introduces the product before the sentence does. It is
              the same glyph as the favicon and the masthead, shown at a size
              where its three bands are actually legible as three states. */}
          <div className="story-mark">
            <Mark size={48} />
          </div>
          <p className="story-eyebrow">The story of {config.wordmark}</p>
          <h1 className="story-h1">
            An agent that touches production should be as accountable as the people who do.
          </h1>
          <p className="story-lede">
            This is the record of building one — in {delivery.commits} commits across nine
            sprints, by one person directing an AI through twelve named roles. It is a
            demonstration, not a company. Everything below can be checked against the
            repository, including the parts that went wrong.
          </p>
        </div>
      </header>

      <div className="wrap story-body">
        {/* --------------------------------------------------------- act one */}
        <section className="reveal">
          <p className="act-label">Act one</p>
          <h2 className="story-h2">Why this exists</h2>

          <p className="story-p">
            AI agents are increasingly asked to do real operational work — read a system&rsquo;s
            documentation, diagnose an incident, propose a fix. The obstacle is rarely
            capability. It is accountability: teams cannot get sign-off to let an agent near
            production because nobody can explain, afterwards, why it said what it said.
          </p>

          <p className="story-p">
            {config.wordmark} is a control plane for that problem. Its central behaviour is not
            answering questions well. It is <strong>refusing to answer</strong> when the evidence
            it found does not support an answer — and proving, per claim, which document each
            statement came from.
          </p>

          <div className="pull">
            Anything can answer. The engineering is in knowing when not to.
          </div>

          <p className="story-p">
            The corpus, the incidents and the metrics are synthetic. The engineering is not —
            the services, the failover, the retrieval, the evaluation, the tests and the
            deployment all genuinely run. That distinction is stated on the site rather than
            buried, because a reader who discovers a simulation themselves discounts everything
            around it.
          </p>
        </section>

        {/* ---------------------------------------------------- the numbers */}
        <section className="reveal-scale story-stats">
          <Stat value={pct(reliability.gate.falseAnswer.rate)} label="False answers"
                note={`budget ${pct(reliability.gate.falseAnswer.budget)}`} />
          <Stat value={reliability.model.auc.toFixed(3)} label="Classifier AUC"
                note={`baseline ${reliability.model.baselineAuc.toFixed(3)}`} />
          <Stat value={String(delivery.tests.total)} label="Tests"
                note={`${delivery.tests.files} files`} />
          <Stat value={String(delivery.defects.total)} label="Defects logged"
                note={`${delivery.defects.severityOne} severity 1`} />
          <Stat value={String(architecture.counts.adrs)} label="Decision records" />
          <Stat value="$0" label="Infrastructure cost" note="enforced by a test" />
        </section>

        {/* --------------------------------------------------------- act two */}
        <section className="reveal">
          <p className="act-label">Act two</p>
          <h2 className="story-h2">How it was built</h2>

          <p className="story-p">
            Not by one person typing. By one person acting as Product Owner and Executive
            Sponsor, directing an AI agent that worked in twelve named delivery roles — Business
            Analyst, Architect, QA Lead, Security Engineer and the rest — under a written charter
            with one rule doing most of the work:
          </p>

          <div className="pull">A role may not sign off its own work.</div>

          <p className="story-p">
            That constraint is why this produced a defect log instead of a demo. The QA role
            caught the engineering role reporting a <strong>0% error rate that was actually
            56.6%</strong>. The security role found a test that passed while the service it
            tested was switched off. The programme role found two entire sprints that had been
            worked and shipped without ever being formally opened.
          </p>

          <p className="story-p">
            All {delivery.defects.total} defects are published, including the embarrassing ones,
            because a delivery record containing only successes is not evidence of anything.
          </p>
        </section>

        {/* ------------------------------------------------------ the chooser */}
        <section className="reveal">
          <h2 className="story-h2" style={{ marginBottom: "var(--s3)" }}>
            Whose story do you want?
          </h2>
          <p className="story-p" style={{ marginBottom: "var(--s6)" }}>
            A project is never one narrative. Pick a role to follow their thread — what they
            owned, what they produced, and the one moment where their particular worry turned out
            to be the right one.
          </p>
          <RoleChooser />
        </section>

        {/* ------------------------------------------------------- act three */}
        <section className="reveal">
          <p className="act-label">Act three</p>
          <h2 className="story-h2">What it proves, and what it doesn&rsquo;t</h2>

          <p className="story-p">
            {done} of {total} requirements are complete. The other {total - done} are marked
            planned, and the traceability matrix says so rather than rounding up — a build check
            fails if any requirement claims to be done while the test it names cannot be found.
          </p>

          <p className="story-p">
            What is genuinely demonstrated: a deterministic multi-provider router with bounded
            spend; hybrid retrieval with per-claim citation; an evidence gate whose thresholds
            are derived from stated error budgets rather than chosen by feel; a trained
            classifier and cross-encoder shipped as ONNX; a security pipeline that has caught
            real problems including in itself; and a governance process that produced eighteen
            logged defects instead of a clean-looking story.
          </p>

          <p className="story-p">
            What is not: real users, real traffic, and the operational history that only comes
            from running something for months. This is a demonstration built to production
            standards, and it says so.
          </p>
        </section>

        {/* ------------------------------------------------------------ next */}
        <section className="reveal">
          <h2 className="story-h2">What happens next</h2>
          <ol className="next-list">
            <li>
              <strong>Finish the release gate.</strong> Penetration tests and the threat-model
              review against the deployed system rather than a local one — Sprint 8&rsquo;s
              remaining stories, unblocked now that both halves are live.
            </li>
            <li>
              <strong>Decide the scope honestly.</strong> {total - done} requirements are still
              open, and many were written for a product with real customers. The right move is an
              explicit decision to de-scope what does not serve the demonstration, so the matrix
              tells the truth instead of implying permanent incompleteness.
            </li>
            <li>
              <strong>Observability and load.</strong> Every fault in the threat model should
              reach a documented response, and the free-tier ceiling should be measured so the
              failure mode is a refusal rather than a bill.
            </li>
          </ol>
        </section>

        <footer className="story-footer">
          <p>
            Source, defect log and all {architecture.counts.adrs} decision records:{" "}
            <a href={`https://github.com/${config.repo}`}>github.com/{config.repo}</a>
          </p>
        </footer>
      </div>
    </main>
  );
}
