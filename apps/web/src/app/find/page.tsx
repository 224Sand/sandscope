import FindExplorer from "@/components/FindExplorer";
import lexicon from "@/generated/lexicon.json";
import config from "@/generated/product.config.json";

export const metadata = { title: `Find — ${config.name}` };

/**
 * Every identifier this project uses, and every place it appears (FR-034).
 *
 * The site cited D-016, ADR-0013, FR-020 and T-15 across every surface and not
 * one was followable. A reader who cannot check a citation has to take it on
 * trust, which is the opposite of the argument this whole project is making.
 *
 * Both the identifiers and their one-sentence meanings are derived by
 * scripts/derive-lexicon.mjs from the records that define them. Nothing here
 * is written twice: an identifier's sentence IS the description column of its
 * row in the defect log, the traceability matrix, the threat model or the
 * sprint plan. A search surface that authored its own summaries would create a
 * second version of every claim on the site, and the two would drift the first
 * time either was edited — which has already happened three times here
 * (D-017, D-019, D-027).
 */
export default function Find() {
  const total = lexicon.entities.reduce((n, e) => n + e.count, 0);
  const defined = lexicon.entities.filter((e) => e.summary).length;

  return (
    <main className="voice-proof wrap surface">
      <header className="mb-7">
        <p className="mono eyebrow-p">{config.wordmark} / FIND</p>
        <h2 className="mb-4">Follow any reference</h2>
        <p className="muted">
          {lexicon.entities.length} identifiers, {total} occurrences. Click any one for its
          record and every place it appears, oldest to newest. Anywhere else on the site,
          an identifier is clickable where it sits — and selecting any text at all offers
          the same lookup, against this project rather than the web.
        </p>
        <p className="mono dim finest mt-4">
          derived at {lexicon.generatedAt} from {lexicon.sha} · {defined} of{" "}
          {lexicon.entities.length} carry a definition
        </p>
      </header>

      <FindExplorer />
    </main>
  );
}
