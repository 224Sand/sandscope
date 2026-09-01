"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import lexicon from "@/generated/lexicon.json";

/**
 * Look anything up, from anywhere on the site.
 *
 * The site is full of references a reader cannot follow. "D-016", "ADR-0013",
 * "FR-020", "T-15" appear across every surface, and each one is a dead end
 * unless you already know which document holds its record. A citation you
 * cannot check is a citation you have to take on trust, which is the opposite
 * of the thing this project is arguing.
 *
 * Two ways in, deliberately:
 *
 *   1. Every identifier becomes clickable, everywhere, without a single page
 *      being edited. A DOM pass after hydration wraps each known id in a
 *      button. Editing twenty surfaces by hand would have meant the next
 *      surface forgets.
 *   2. Select any text at all and a lookup appears — the same gesture as a
 *      browser's own "search for this", pointed at this project instead of
 *      the web.
 *
 * The answer is one sentence, and it is LIFTED rather than written: an
 * identifier's sentence is the description column of the record that defines
 * it. Nothing here paraphrases the corpus. A search feature that wrote its own
 * summaries would be authoring a second version of every claim on the site,
 * and the two would drift the first time one was edited — which is D-017,
 * D-019 and D-027, three times already.
 *
 * The corpus for free-text search is fetched on FIRST USE, never at load: it
 * is 333KB that most visitors never need, and the landing page has a
 * performance budget it is currently well inside.
 */

type Occurrence = { file: string; line: number; text: string; date: string | null };
type Entity = {
  id: string;
  kind: string;
  label: string;
  summary: string | null;
  definedIn: string | null;
  date: string | null;
  status?: string | null;
  file?: string;
  occurrences: Occurrence[];
  count: number;
};

type Corpus = { documents: { file: string; date: string | null; lines: string[] }[] };

const ENTITIES = lexicon.entities as Entity[];
const BY_ID = new Map(ENTITIES.map((e) => [e.id, e]));

/** One regex for every known identifier, longest first so `S9-KT` is not
 *  matched as `S9-K`. Escaped because ids contain `-` and `.`. */
const ID_PATTERN = new RegExp(
  `\\b(${[...BY_ID.keys()]
    .sort((a, b) => b.length - a.length)
    .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})\\b`,
  "g",
);

const REPO = "224Sand/sandscope";

/* ------------------------------------------------------------------ helpers */

function githubUrl(file: string, line?: number) {
  return `https://github.com/${REPO}/blob/main/${file}${line ? `#L${line}` : ""}`;
}

/** Newest first is the default: what was most recently said about this, then
 *  the trail backwards to where it started. */
function ordered(list: Occurrence[], newestFirst: boolean) {
  const sorted = [...list].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  return newestFirst ? sorted.reverse() : sorted;
}

/** The one-sentence answer for a free-text phrase. Facts only — counts, files
 *  and dates that the corpus can be asked for — never a paraphrase. */
function phraseSentence(phrase: string, hits: Occurrence[]): string {
  if (hits.length === 0) return `“${phrase}” does not appear anywhere in this project.`;
  const files = new Set(hits.map((h) => h.file));
  const dated = hits.filter((h) => h.date).sort((a, b) => a.date!.localeCompare(b.date!));
  const first = dated[0];
  const last = dated[dated.length - 1];
  const span =
    first && last && first.date !== last.date
      ? `, first written into ${first.file.split("/").pop()} on ${first.date} and most recently into ${last.file.split("/").pop()} on ${last.date}`
      : first
        ? `, all of it dated ${first.date}`
        : "";
  return (
    `“${phrase}” appears ${hits.length} time${hits.length === 1 ? "" : "s"} across ` +
    `${files.size} document${files.size === 1 ? "" : "s"}${span} — every occurrence is listed below, newest first.`
  );
}

/* -------------------------------------------------------------- the panel */

function Panel({
  query, entity, onClose, onQuery,
}: {
  query: string;
  entity: Entity | null;
  onClose: () => void;
  onQuery: (q: string) => void;
}) {
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [loading, setLoading] = useState(false);
  const [newestFirst, setNewestFirst] = useState(true);
  const [draft, setDraft] = useState(query);

  useEffect(() => setDraft(query), [query]);

  // Fetched on first free-text search, not at load.
  useEffect(() => {
    if (entity || corpus || loading) return;
    setLoading(true);
    fetch("/search-corpus.json")
      .then((r) => r.json())
      .then(setCorpus)
      .catch(() => setCorpus({ documents: [] }))
      .finally(() => setLoading(false));
  }, [entity, corpus, loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const textHits = useMemo(() => {
    if (entity || !corpus || query.trim().length < 2) return [];
    const needle = query.trim().toLowerCase();
    const hits: Occurrence[] = [];
    for (const doc of corpus.documents) {
      doc.lines.forEach((line, i) => {
        if (line.toLowerCase().includes(needle)) {
          hits.push({ file: doc.file, line: i + 1, text: line.trim().slice(0, 320), date: doc.date });
        }
      });
    }
    return hits;
  }, [corpus, query, entity]);

  const occurrences = entity ? entity.occurrences : textHits;
  const sentence = entity
    ? entity.summary
      ? `${entity.label} ${entity.id} — ${entity.summary}.`
      : `${entity.id} is cited ${entity.count} time${entity.count === 1 ? "" : "s"} in this project but no record anywhere defines it, which is worth knowing rather than hiding.`
    : loading
      ? "Reading the corpus…"
      : phraseSentence(query.trim(), textHits);

  return (
    <div className="lookup-scrim" onClick={onClose} role="presentation">
      <div
        className="lookup"
        role="dialog"
        aria-modal="true"
        aria-label={`Look up ${entity ? entity.id : query}`}
        onClick={(e) => e.stopPropagation()}
      >
        <form
          className="lookup-search"
          onSubmit={(e) => { e.preventDefault(); onQuery(draft); }}
        >
          <input
            className="lookup-input"
            value={draft}
            autoFocus
            spellCheck={false}
            placeholder="Look up anything in SandScope"
            aria-label="Look up anything in SandScope"
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="lookup-close" type="button" onClick={onClose} aria-label="Close">
            esc
          </button>
        </form>

        <div className="lookup-body">
          <p className="lookup-sentence">{sentence}</p>

          {entity && (
            <div className="lookup-meta">
              {entity.status && <span className="chip chip--neutral">{entity.status.toLowerCase()}</span>}
              {entity.date && <span className="mono lookup-date">{entity.date}</span>}
              {entity.definedIn && (
                <a className="mono lookup-src" href={githubUrl(entity.definedIn)}>
                  {entity.definedIn} →
                </a>
              )}
            </div>
          )}

          <div className="lookup-bar">
            <h4 className="lookup-h">
              Everywhere it exists
              <span className="mono lookup-count">{occurrences.length}</span>
            </h4>
            {occurrences.length > 1 && (
              <button className="lookup-order" type="button" onClick={() => setNewestFirst((v) => !v)}>
                {newestFirst ? "newest first ↓" : "oldest first ↑"}
              </button>
            )}
          </div>

          <ol className="lookup-bank">
            {ordered(occurrences, newestFirst).map((o, i) => (
              <li key={`${o.file}:${o.line}:${i}`} className="lookup-hit">
                <div className="lookup-hit-head">
                  <span className="mono lookup-hit-date">{o.date ?? "undated"}</span>
                  <a className="mono lookup-hit-file" href={githubUrl(o.file, o.line)}>
                    {o.file}:{o.line}
                  </a>
                </div>
                <p className="lookup-hit-text">{o.text}</p>
              </li>
            ))}
          </ol>

          {occurrences.length === 0 && !loading && (
            <p className="lookup-empty">
              Nothing in the documents matches. The corpus is the project&rsquo;s own
              records — it holds what was written down, not everything that happened.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- the provider */

export default function Lookup() {
  const [query, setQuery] = useState<string | null>(null);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [chip, setChip] = useState<{ x: number; y: number; text: string } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const open = useCallback((term: string) => {
    setEntity(BY_ID.get(term.trim()) ?? null);
    setQuery(term);
    setChip(null);
  }, []);

  const close = useCallback(() => { setQuery(null); setEntity(null); }, []);

  /* --- make every identifier clickable, everywhere, after hydration ------ */
  useEffect(() => {
    if (query !== null) return; // don't rewrite the page under an open panel
    const main = document.querySelector("main");
    if (!main) return;

    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        // Never rewrite inside something already interactive, already a ref,
        // or inside form controls / SVG text where a <button> is invalid.
        if (parent.closest("a, button, input, textarea, select, svg, .lex-ref, .lookup"))
          return NodeFilter.FILTER_REJECT;
        return ID_PATTERN.test(node.nodeValue ?? "")
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });

    const targets: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) targets.push(node as Text);

    for (const text of targets) {
      const value = text.nodeValue ?? "";
      ID_PATTERN.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let last = 0;
      let match: RegExpExecArray | null;
      while ((match = ID_PATTERN.exec(value)) !== null) {
        if (match.index > last) fragment.append(value.slice(last, match.index));
        const button = document.createElement("button");
        button.type = "button";
        button.className = "lex-ref";
        button.textContent = match[0];
        button.dataset.ref = match[0];
        button.title = BY_ID.get(match[0])?.summary ?? `Look up ${match[0]}`;
        fragment.append(button);
        last = match.index + match[0].length;
      }
      if (last < value.length) fragment.append(value.slice(last));
      text.parentNode?.replaceChild(fragment, text);
    }
  }, [query]);

  /* --- one delegated listener for every generated button ---------------- */
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(".lex-ref");
      if (target?.dataset.ref) { event.preventDefault(); open(target.dataset.ref); }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  /* --- select any text at all, and offer to look it up ------------------ */
  useEffect(() => {
    const onUp = () => {
      if (query !== null) return;
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      // 140, not 80: a reader dragging across a phrase overshoots easily, and
      // an affordance that silently declines to appear reads as broken. The cap
      // exists to skip whole-paragraph selections, not to police precision.
      if (text.length < 2 || text.length > 140 || !selection?.rangeCount) { setChip(null); return; }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) { setChip(null); return; }
      setChip({ x: rect.left + rect.width / 2, y: rect.top, text });
    };
    document.addEventListener("mouseup", onUp);
    document.addEventListener("keyup", onUp);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keyup", onUp);
    };
  }, [query]);

  return (
    <div ref={root}>
      {chip && (
        <button
          className="lookup-chip"
          style={{ left: chip.x, top: chip.y }}
          onMouseDown={(e) => { e.preventDefault(); open(chip.text); }}
        >
          Look up in SandScope
        </button>
      )}
      {query !== null && (
        <Panel query={query} entity={entity} onClose={close} onQuery={open} />
      )}
    </div>
  );
}
