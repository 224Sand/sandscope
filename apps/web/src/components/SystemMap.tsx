"use client";

import { useState } from "react";

import config from "@/generated/product.config.json";

/**
 * The request path, drawn as it actually runs — and selectable (FR-019).
 *
 * Inline SVG rather than an image so it inherits the theme tokens and stays
 * legible at any zoom. Every box corresponds to a module in the repository;
 * the numbered order is the order a request traverses them, and the two dashed
 * returns are the paths that do NOT reach a provider — a cache hit and a
 * refusal — because those are the interesting ones.
 *
 * The requirement asks for an INTERACTIVE architecture view, and until this
 * sprint the page shipped a static drawing under that heading: no state, no
 * handlers, nothing to select. A diagram a reader cannot interrogate tells
 * them the shape of the system and nothing about whether it is real.
 *
 * So each node resolves to the file that implements it. Not a description of
 * the module — the path, linked, so the claim "this box is a real thing" is
 * checkable in one click. Every path below was verified to exist before it was
 * written here: D-023 was twelve decision links that pointed at a directory
 * because a filename was never emitted, and they rendered as perfectly
 * ordinary links.
 *
 * Keyboard-operable because an SVG full of click handlers is otherwise a
 * mouse-only surface, and a reader on a keyboard would get the static drawing
 * this replaced.
 */

type NodeSpec = {
  id: string;
  x: number;
  y: number;
  w: number;
  title: string;
  sub: string;
  /** What it does, in one sentence a non-specialist can hold. */
  what: string;
  /** The file that implements it, relative to the repository root. */
  file: string;
};

const NODES: NodeSpec[] = [
  {
    id: "console",
    x: 0, y: 22, w: 190,
    title: "Browser console",
    sub: "SSE consumer",
    what: "Reads the run as it happens. Nothing is buffered and replayed — a visitor watching an agent reason is watching it, not reading a transcript afterwards.",
    file: "apps/web/src/components/Console.tsx",
  },
  {
    id: "bff",
    x: 0, y: 86, w: 190,
    title: "BFF route handler",
    sub: "rate limit · fails closed",
    what: "The only thing that holds the runtime's token or knows its URL. Refuses when the rate limiter is unreachable rather than allowing through — an outage becomes unavailability, never unbounded spend.",
    file: "apps/web/src/app/api/runs/stream/route.ts",
  },
  {
    id: "orchestrator",
    x: 240, y: 22, w: 190,
    title: "Orchestrator",
    sub: "langgraph · one chokepoint",
    what: "The graph every workload compiles to. Both workloads share one topology, so a governance rule cannot hold on one path and not the other.",
    file: "apps/agent/sandscope_agent/orchestrator/graph.py",
  },
  {
    id: "retrieval",
    x: 240, y: 86, w: 190,
    title: "Hybrid retrieval",
    sub: "BM25 + dense",
    what: "Lexical and dense search over the corpus, fused. Degrades to lexical-only when the embedder is unavailable, and says so rather than returning quietly worse results.",
    file: "apps/agent/sandscope_agent/retrieval/hybrid.py",
  },
  {
    id: "evidence",
    x: 240, y: 150, w: 190,
    title: "Evidence gate",
    sub: "3 bands · default refuse",
    what: "Decides whether the retrieved material supports answering AT ALL. Its thresholds come from error budgets against 715 labelled questions, not from taste.",
    file: "apps/agent/sandscope_agent/retrieval/evidence.py",
  },
  {
    id: "spend",
    x: 240, y: 214, w: 190,
    title: "Spend guard",
    sub: "reserve worst case first",
    what: "Reserves against the most expensive provider that could still serve, before the call. Pricing the cheapest one under-reserved by 4× the moment failover moved.",
    file: "apps/agent/sandscope_agent/orchestrator/budget.py",
  },
  {
    id: "cache",
    x: 480, y: 22, w: 190,
    title: "Semantic cache",
    sub: "exact hash, then vector",
    what: "Exact match first, then similarity. Its threshold belongs to the embedder rather than the cache — a module-level constant was wrong in both directions at once.",
    file: "apps/agent/sandscope_agent/router/cache.py",
  },
  {
    id: "providers",
    x: 480, y: 86, w: 190,
    title: "Provider chain",
    sub: "5, time-boxed disables",
    what: "Fixed failover order. A rate-limited provider is disabled for a bounded interval and the clock is injected, so expiry is tested rather than waited on.",
    file: "apps/agent/sandscope_agent/router/router.py",
  },
  {
    id: "neon",
    x: 710, y: 86, w: 170,
    title: "Neon + pgvector",
    sub: "chunks · runs · spans",
    what: "Corpus chunks and their embeddings, plus the record of every completed run: its citations, its spans, and the approval that gated it.",
    file: "apps/agent/migrations/0001_initial.sql",
  },
  {
    id: "upstash",
    x: 710, y: 150, w: 170,
    title: "Upstash",
    sub: "redis · vector",
    what: "Per-IP rate limiting at the edge. Holds a salted digest of the address rather than the address — the limiter needs to tell visitors apart, not identify them.",
    file: "apps/web/src/lib/ratelimit.ts",
  },
];

export default function SystemMap() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = NODES.find((n) => n.id === activeId) ?? null;

  const label = { fill: "var(--text)", fontSize: 11.5, fontFamily: "var(--sans)" } as const;
  const sub = { fill: "var(--text-3)", fontSize: 9.5, fontFamily: "var(--mono)" } as const;

  return (
    <div>
      <svg
        viewBox="0 0 880 336"
        role="group"
        // A stable hook for the e2e suite. The page carries more than one
        // svg -- the masthead mark is one too -- so a positional selector
        // silently asserted against the logo instead of the diagram.
        data-testid="system-map"
        aria-label="Request path: browser to edge BFF to agent runtime, through retrieval, the evidence gate, the semantic cache and the provider chain, with dashed returns for cache hits and refusals. Select any component to see the file that implements it."
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <defs>
          <marker id="a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" fill="var(--text-3)" />
          </marker>
        </defs>

        <text x="0" y="12" {...sub} fill="var(--text-3)">EDGE — vercel dub1</text>
        <text x={240} y="12" {...sub} fill="var(--text-3)">RUNTIME — northflank container</text>
        <text x={480} y="12" {...sub} fill="var(--text-3)">PROVIDERS — ordered failover</text>
        <text x={710} y="12" {...sub} fill="var(--text-3)">DATA — ireland</text>

        {[
          [190, 44, 240, 44], [95, 66, 95, 86], [190, 108, 240, 108],
          [335, 66, 335, 86], [335, 130, 335, 150], [335, 194, 335, 214],
          [430, 44, 480, 44], [575, 66, 575, 86], [670, 108, 710, 108],
          [670, 172, 710, 172],
        ].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-3)" strokeWidth="1" markerEnd="url(#a)" />
        ))}

        {NODES.map((node) => {
          const on = node.id === activeId;
          return (
            <g
              key={node.id}
              className="map-node"
              data-on={on ? "true" : "false"}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={`${node.title}: ${node.sub}`}
              onClick={() => setActiveId(on ? null : node.id)}
              onKeyDown={(event) => {
                // Space and Enter, because a <g role="button"> gets neither
                // for free the way a real <button> does.
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setActiveId(on ? null : node.id);
                }
              }}
            >
              <rect
                x={node.x} y={node.y} width={node.w} height={44} rx={6}
                fill={on ? "var(--surface)" : "var(--surface-2)"}
                stroke={on ? "var(--accent)" : "var(--line)"}
              />
              <text x={node.x + 12} y={node.y + 19} {...label}>{node.title}</text>
              <text x={node.x + 12} y={node.y + 34} {...sub}>{node.sub}</text>
            </g>
          );
        })}

        {/* The two paths that never reach a provider. Each label sits in its own
            lane on the line it describes, masked by a panel-coloured plate so the
            dashes do not run through the words.
            Both plates were 4px too short to cover their text, so the dashes ran
            through the last two characters of each label. Measured rather than
            eyeballed, and asserted in the e2e suite, because a 4px overlap is
            exactly the kind of thing that looks fine until someone reads it. */}
        <path d="M480 34 L455 34 L455 286 L120 286 L120 130" fill="none" stroke="var(--grounded)"
              strokeWidth="1" strokeDasharray="3 3" markerEnd="url(#a)" />
        <rect x={128} y={278} width={174} height={15} rx={3} fill="var(--surface)" />
        <text x={134} y={289} {...sub} fill="var(--grounded)">cache hit — no provider call</text>

        <path d="M240 172 L215 172 L215 314 L120 314 L120 142" fill="none" stroke="var(--refused)"
              strokeWidth="1" strokeDasharray="3 3" markerEnd="url(#a)" />
        <rect x={128} y={306} width={202} height={15} rx={3} fill="var(--surface)" />
        <text x={134} y={317} {...sub} fill="var(--refused)">INSUFFICIENT — nothing is emitted</text>
      </svg>

      {/* aria-live so a screen-reader user learns the selection did something.
          Rendered always rather than conditionally, so the region exists to be
          updated rather than being announced as newly appearing. */}
      <div className="map-detail" aria-live="polite" data-testid="system-map-detail">
        {active ? (
          <>
            <h4 className="map-detail-title">{active.title}</h4>
            <p className="map-detail-what">{active.what}</p>
            <a
              className="mono map-detail-file"
              href={`https://github.com/${config.repo}/blob/main/${active.file}`}
            >
              {active.file} →
            </a>
          </>
        ) : (
          <p className="map-detail-hint">
            Select any component to see what it does and the file that implements it.
          </p>
        )}
      </div>
    </div>
  );
}
