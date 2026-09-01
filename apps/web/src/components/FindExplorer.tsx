"use client";

import { useMemo, useState } from "react";

import lexicon from "@/generated/lexicon.json";

type Entity = {
  id: string; kind: string; label: string; summary: string | null;
  definedIn: string | null; date: string | null; count: number;
};

const ENTITIES = lexicon.entities as Entity[];
const KINDS = lexicon.kinds as { kind: string; label: string }[];

/**
 * The index of everything this project names.
 *
 * Rows render their id as a `.lex-ref` button, which the site-wide Lookup
 * already listens for — so this page needs no wiring of its own, and an id
 * behaves identically here and in the middle of a paragraph on any other
 * surface.
 */
export default function FindExplorer() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ENTITIES.filter((e) => {
      if (kind && e.kind !== kind) return false;
      if (!needle) return true;
      return (
        e.id.toLowerCase().includes(needle) ||
        (e.summary ?? "").toLowerCase().includes(needle)
      );
    });
  }, [q, kind]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of ENTITIES) map.set(e.kind, (map.get(e.kind) ?? 0) + 1);
    return map;
  }, []);

  return (
    <div>
      <input
        className="find-input"
        value={q}
        spellCheck={false}
        placeholder={`Filter ${ENTITIES.length} identifiers — or select any text anywhere on the site`}
        aria-label="Filter identifiers"
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="find-kinds">
        <button
          type="button"
          className="find-kind"
          data-on={kind === null ? "true" : "false"}
          onClick={() => setKind(null)}
        >
          all <span className="mono dim">{ENTITIES.length}</span>
        </button>
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            className="find-kind"
            data-on={kind === k.kind ? "true" : "false"}
            onClick={() => setKind(kind === k.kind ? null : k.kind)}
          >
            {k.label.toLowerCase()} <span className="mono dim">{counts.get(k.kind) ?? 0}</span>
          </button>
        ))}
      </div>

      <p className="mono dim finest mb-5">
        {shown.length} shown · click any identifier for its record and every place it appears
      </p>

      <ol className="find-list">
        {shown.map((e) => (
          <li key={e.id} className="find-row">
            <button type="button" className="lex-ref mono find-id" data-ref={e.id}>
              {e.id}
            </button>
            <span className="find-summary">
              {e.summary ?? (
                <em className="find-nodef">
                  cited {e.count} time{e.count === 1 ? "" : "s"}, but no record in the
                  repository defines it
                </em>
              )}
            </span>
            <span className="mono find-count">{e.count}</span>
          </li>
        ))}
      </ol>

      {shown.length === 0 && (
        <p className="dim fine-2">
          No identifier matches. Free text is searched against the documents
          themselves — select the phrase anywhere on the site, or press return in
          the lookup.
        </p>
      )}
    </div>
  );
}
