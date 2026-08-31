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
    // In the EDGE column, not DATA, because the edge is the only thing that
    // calls it: the sole reference in the repository is the BFF's rate
    // limiter. Drawn in the data column it had no incoming edge at all — the
    // arrow pointing at it started in empty space, because there was no node
    // on that side that talks to it.
    x: 0, y: 150, w: 110,
    title: "Upstash",
    // Redis only. This read "redis · vector" for six sprints; Upstash Vector
    // appears exactly once in the repository, in training/benchmark_vector_store.py,
    // as the managed-store comparison arm for ADR-0011. It has never served a
    // request, and a diagram is the wrong place to find that out.
    sub: "redis · edge",
    what: "Per-IP rate limiting, called from the edge before a request reaches the runtime. Hosted in Ireland. Holds a salted digest of the address rather than the address — the limiter needs to tell visitors apart, not identify them.",
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
        aria-label="Request path: the browser console calls the edge BFF, which checks the Upstash rate limiter before reaching the agent runtime. The runtime runs hybrid retrieval against Neon, then the evidence gate, the spend guard, the semantic cache and the provider chain. Dashed returns show the two paths that never reach a provider: a cache hit and a refusal. Select any component to see the file that implements it."
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
          [430, 44, 480, 44], [575, 66, 575, 86],
          // the edge calls the rate limiter before anything else runs
          [55, 130, 55, 150],
        ].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-3)" strokeWidth="1" markerEnd="url(#a)" />
        ))}

        {/* Retrieval reads the corpus out of Neon. This edge used to leave the
            PROVIDER CHAIN, which never opens a database connection — nothing in
            router.py imports the db module. It is routed under the provider
            column rather than drawn straight, because a straight line at y=108
            would pass through the middle of the Provider chain box and read as
            though it originated there, which is the error being corrected. */}
        <path d="M430 108 L440 108 L440 250 L690 250 L690 108 L710 108" fill="none"
              stroke="var(--text-3)" strokeWidth="1" markerEnd="url(#a)" />

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
            lane on the line it describes, and masks the dashes with a halo
            painted from its own glyphs rather than with a fixed-width plate.

            The plate version was wrong twice. First it was 4px too short and
            the dashes struck through the last two characters. Widening it fixed
            that on macOS and broke it on Linux and at mobile scale, because a
            plate sized in user units cannot track text whose width depends on
            the font the platform actually resolved — CI caught what a local run
            could not. `paintOrder: stroke` draws a background-coloured stroke
            under the fill, so the mask is the shape of the text at whatever
            width it renders. */}
        {(() => {
          const halo = {
            stroke: "var(--surface)",
            // 5 rather than 3: the halo extends half its width either side of
            // each glyph, so it must be wide enough to close the SPACES
            // between words too. At 3 the dashes showed through the gaps and
            // read as hyphens — "cache-hit — no-provider-call".
            strokeWidth: 5,
            strokeLinejoin: "round",
            paintOrder: "stroke",
          } as const;
          return (
            <>
              <path d="M480 34 L455 34 L455 286 L120 286 L120 130" fill="none" stroke="var(--grounded)"
                    strokeWidth="1" strokeDasharray="3 3" markerEnd="url(#a)" />
              <text x={134} y={289} {...sub} {...halo} fill="var(--grounded)">
                cache hit — no provider call
              </text>

              <path d="M240 172 L215 172 L215 314 L140 314 L140 130" fill="none" stroke="var(--refused)"
                    strokeWidth="1" strokeDasharray="3 3" markerEnd="url(#a)" />
              <text x={154} y={317} {...sub} {...halo} fill="var(--refused)">
                INSUFFICIENT — nothing is emitted
              </text>
            </>
          );
        })()}
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
