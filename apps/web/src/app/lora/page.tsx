import config from "@/generated/product.config.json";

export const metadata = {
  title: `LoRA adapters — ${config.name}`,
  description:
    "Four LoRA adapters over one base encoder, replacing the semantic regexes that " +
    "decide what this system trusts. Designed and in progress, not shipped.",
};

const SRC = `https://github.com/${config.repo}/blob/main`;
// The design and plan are committed on an unpushed branch, so there is no URL
// that resolves for them yet. They are cited by path rather than linked: a dead
// citation on a page arguing that claims must be checkable is self-refuting, and
// a path a reader can find after the branch lands is honest about the state.
const SPEC_PATH = "docs/superpowers/specs/2026-09-02-lora-adapters-design.md";
const PLAN_PATH = "docs/superpowers/plans/2026-09-02-lora-spine-and-claim-support.md";
const adr = (n: string, slug: string) => `${SRC}/docs/03-architecture/adr/${n}-${slug}.md`;

/**
 * What the semantic layer is being replaced with, and why (FR pending).
 *
 * This page is written from the design and the plan rather than derived from a
 * generated JSON file, because the source is prose rather than structured data.
 * That means it can drift, so it states its status at the top and links every
 * claim to the document it came from -- the same contract the other pages get
 * from their build-time parse, enforced by reading rather than by a script.
 *
 * Status is load-bearing here: none of this is shipped. Saying otherwise on a
 * site whose whole argument is that claims must be checkable would be the exact
 * failure it spends every other page refusing.
 */

const REGEXES: [string, string, string][] = [
  [
    "does this question demand a quantity?",
    "_DEMANDS_A_VALUE",
    "a demand phrased outside the listed nouns",
  ],
  [
    "does this passage supply one?",
    "_CONTAINS_A_VALUE",
    "“a fortnight”, “two business days”",
  ],
  [
    "is this proposed action destructive?",
    "_DESTRUCTIVE, _IRREVERSIBLE",
    "“take node-3 out of the pool”; fires on “do not restart”",
  ],
  [
    "is this claim cited?",
    "uncited_claims",
    "whether the cited chunk supports the claim",
  ],
];

const ADAPTERS: [string, string, string, string][] = [
  ["A1", "claim-support", "uncited_claims", "(claim, chunk) → entailed / not"],
  ["A2", "value-demand", "_DEMANDS_A_VALUE", "question → demands a quantity"],
  ["A3", "destructive-intent", "_DESTRUCTIVE, _IRREVERSIBLE", "proposal → destructive"],
  ["A4", "instruction-smuggling", "nothing — T-15 is unguarded", "body → carries injected instructions"],
];

export default function LoraPage() {
  return (
    <main className="voice-proof wrap surface">
      <header className="mb-7">
        <p className="mono eyebrow-p">{config.wordmark} / LORA</p>
        <h2 className="mb-4">Every semantic decision in this system is a regular expression</h2>
        <p className="lede-lg">
          Whether a question demands a number, whether a passage supplies one, whether an action is
          destructive, whether a citation supports the claim citing it — all four are pattern
          matches. Negation, paraphrase and entailment are precisely what a regex cannot do.
        </p>
        <div className="pull rule-y">
          Four LoRA adapters over one base encoder, replacing all four.
        </div>
        <p className="note measure">
          <strong>Status: designed and in progress, not shipped.</strong> The design and the
          implementation plan are written and the training spine is being built, on a branch that
          has not landed yet — so they are cited below by path rather than linked, because a
          citation that 404s is worse than none. No adapter is serving. The two models currently in
          production — the evidence classifier and the cross-encoder re-ranker — are ordinary fine
          tunes and predate this work. This page describes what is coming and why, and it will say
          so until that stops being true.
        </p>
      </header>

      {/* --------------------------------------------------------- the problem */}
      <section className="panel mb-6">
        <h3 className="mb-3">What the regexes structurally cannot do</h3>
        <p className="lede-p">
          This is not an oversight. It is the zero-LLM-at-request-time discipline, and it has been
          paid for: the first version of <code className="mono">_CONTAINS_A_VALUE</code> was a plain{" "}
          <code className="mono">\d</code>, matched “Tier 0” and “Severity 1” everywhere, and so
          passed while catching nothing.
        </p>
        <div className="tablewrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="th-pad">Decision</th>
                <th className="th-pad">Today</th>
                <th className="th-pad">What it cannot reach</th>
              </tr>
            </thead>
            <tbody>
              {REGEXES.map(([decision, impl, cannot]) => (
                <tr key={impl}>
                  <td className="cell">{decision}</td>
                  <td className="cell"><code className="mono">{impl}</code></td>
                  <td className="cell">{cannot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="footnote">
          A small fine-tuned encoder does exactly this, while preserving every property the
          architecture requires: trained offline, served as ONNX, no framework at runtime, no API
          call, deterministic, tens of milliseconds.
        </p>
      </section>

      {/* ------------------------------------------------------------ why lora */}
      <section className="panel mb-6">
        <h3 className="mb-3">Why LoRA specifically — including what it does not buy</h3>
        <ul className="plain-list mb-5">
          <li>
            <strong>One base, four tasks.</strong> All four decisions are sequence or sequence-pair
            classification. Full fine-tuning ships four ~140M models; LoRA ships one base and four
            adapters of roughly a megabyte each.
          </li>
          <li>
            <strong>Capacity match.</strong> Each task has hundreds to low thousands of constructed
            examples. Full fine-tuning 140M parameters against 2,000 examples overfits, and this
            project has already been burned by exactly that —{" "}
            <a href={adr("0013", "the-classifier-stays-out-of-the-live-gate")}>ADR-0013</a>&rsquo;s
            operating point looked excellent on one pass and failed held-out folds at 6.1% against a
            5% budget. LoRA&rsquo;s low-rank constraint is the regulariser.
          </li>
        </ul>
        <p className="para">
          <strong>What LoRA does not buy here, stated plainly:</strong> the serving-side benefit.
          Each adapter is merged into the base and exported to ONNX, so what ships is four ordinary
          models — not a base plus swappable deltas. The saving is training-side. That is a
          legitimate reason to use LoRA and it is a different reason from the one most people
          assume, so it is written down rather than implied.
        </p>
      </section>

      {/* ----------------------------------------------------------- adapters */}
      <section className="panel mb-6">
        <h3 className="mb-3">The four adapters</h3>
        <div className="tablewrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="th-pad">Adapter</th>
                <th className="th-pad">Replaces</th>
                <th className="th-pad">Task shape</th>
              </tr>
            </thead>
            <tbody>
              {ADAPTERS.map(([id, name, replaces, shape]) => (
                <tr key={id}>
                  <td className="cell">
                    <strong>{id}</strong> {name}
                  </td>
                  <td className="cell"><code className="mono">{replaces}</code></td>
                  <td className="cell">{shape}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="footnote">
          A1 is the one that changes what the product can claim. <code className="mono">verify</code>{" "}
          currently checks that a claim <em>has</em> a citation; it has never checked that the
          citation <em>supports</em> it. That gap is the product&rsquo;s central promise.
        </p>
      </section>

      {/* -------------------------------------------------------------- labels */}
      <section className="panel mb-6">
        <h3 className="mb-3">Labels are true by construction, never a model&rsquo;s opinion</h3>
        <p className="lede-p">
          <a href={adr("0010", "training-labels-must-be-true-by-construction")}>ADR-0010</a> forbids
          model-assigned labels, on the grounds that ground truth which is itself a model&rsquo;s
          opinion makes the resulting claim unfalsifiable. Every label is a property of how the
          example was built.
        </p>
        <ul className="plain-list mb-5">
          <li>
            <strong>A1.</strong> A sentence extracted from chunk <em>C</em>, paired with <em>C</em>,
            is supported by construction. Hard negatives: the same sentence with a template negation
            applied so the label flips, and the same sentence paired with the highest-ranked
            non-source chunk. Trivial lexical overlap is the failure mode here, so the negation arm
            is what makes the task non-trivial.
          </li>
          <li>
            <strong>A2.</strong> The label is read from the question generator&rsquo;s slot, never
            from <code className="mono">_DEMANDS_A_VALUE</code>. Labelling from the regex would
            teach the model the regex and measure agreement rather than correctness.
          </li>
          <li>
            <strong>A3.</strong> Proposals are synthesized as action × target tier × reversibility,
            and the label is the slot rather than the surface string. The surface is then paraphrased
            without touching the slot, so the regex breaks while the label holds. This is the
            adversarial arm and the reason the task exists.
          </li>
        </ul>
        <p className="para">
          None of it may call a model, and a test asserts that by parsing the module rather than
          trusting the author.
        </p>
      </section>

      {/* ---------------------------------------------------- distribution shift */}
      <section className="panel mb-6">
        <h3 className="mb-3">The number that would have been a lie</h3>
        <p className="lede-p">
          A1 trains on sentences from the corpus but serves on sentences a <em>model</em> wrote.
          Those are different distributions, and a number from the first does not transfer to the
          second.
        </p>
        <p className="para">
          The <code className="mono">citation</code> table already stores{" "}
          <code className="mono">claim_text</code> and <code className="mono">chunk_id</code> for
          every completed run — real model-written claims paired with the chunk actually cited. That
          is the serving distribution, recorded before anyone needed it. A1&rsquo;s headline number
          is measured there, on hand-adjudicated ground truth, and reported <em>separately</em> from
          the constructed test set. The constructed number measures the task; the recorded one
          measures the product.
        </p>
        <p className="footnote">
          Serving stays unchanged:{" "}
          <a href={adr("0009", "train-offline-serve-without-the-framework")}>ADR-0009</a> means no
          torch, transformers or peft in the serving image. Adapters are merged, exported to ONNX,
          and run through the same runtime as the re-ranker.
        </p>
      </section>

      {/* ------------------------------------------------------------ inception */}
      <section className="panel">
        <h3 className="mb-3">Where this work came from</h3>
        <p className="para">
          The discipline above is not native to machine learning practice — it is what the delivery
          roles on this project demanded. Labels true by construction is a Business Analyst&rsquo;s
          objection to unfalsifiable evidence. Measuring on the recorded serving distribution rather
          than the convenient one is a QA Lead refusing a number that flatters. ADR-0013 exists
          because a held-out fold contradicted an operating point that had already been accepted.
        </p>
        <p className="para">
          That review process was written down as a charter, replayed against this
          repository&rsquo;s real history on the <a href="/council">council page</a>, and then
          extracted into <strong><a href="/charter">Charter</a></strong> — an open-source MCP server
          that enforces the same rules on any repository, for anyone. A role must produce a
          machine-checkable artifact before it may sign off, and no role may sign off its own work.
        </p>
        <p className="para">
          So the adapters are governed by the tool the adapters&rsquo; own project produced. When A1
          ships, the number it ships with will have been argued over by roles that were required to
          disagree in public — and the record of that argument will be in the repository next to the
          model.
        </p>
        <p className="footnote mb-4">
          The design is <code className="mono">{SPEC_PATH}</code> and the plan is{" "}
          <code className="mono">{PLAN_PATH}</code>. Both land on <code className="mono">main</code>{" "}
          when the branch does, and this page will link them once they resolve.
        </p>
        <div className="row-links">
          <a className="mono finer" href="/charter">charter — the tool this work is governed by →</a>
          <a className="mono finer" href="/council">the council record →</a>
        </div>
      </section>
    </main>
  );
}
