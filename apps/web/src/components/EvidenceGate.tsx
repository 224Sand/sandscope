"use client";

import { useId, useState } from "react";

/**
 * The refusal decision, made draggable (FR-033).
 *
 * This is the one idea the whole product rests on, and prose explains it
 * badly to both audiences at once: a non-technical reader gets "it decides
 * whether the evidence is good enough" and learns nothing about why that is
 * hard, while an engineer wants the numbers and gets adjectives.
 *
 * So the reader moves the score themselves and watches the verdict change.
 * Same control, two depths: the bands and consequences answer the first
 * reader, the thresholds and real probe scores answer the second.
 *
 * The pins are REAL. Every score below was measured by running the query
 * through the live retriever and `combined_score`, not chosen to make the
 * chart legible. That is why they are uncomfortable — see `OVERLAP` below.
 * A demo that placed the answerable questions neatly above the unanswerable
 * ones would be teaching a lie about the hardest part of this problem.
 *
 * Motion here explains rather than decorates (DESIGN_SYSTEM §Motion): the only
 * thing that moves is the value the reader is dragging.
 */

/** From retrieval/evidence.py. Not copied by hand — see the test that asserts
 *  these match the source constants. */
const INSUFFICIENT_BELOW = 0.74;
const SUFFICIENT_ABOVE = 10.38;
const AXIS_MAX = 14;

type Probe = { score: number; truth: "answerable" | "unanswerable"; text: string };

/** Measured against the real corpus. `training/` has the script; these are
 *  pinned so the component cannot drift into flattering numbers. */
const PROBES: Probe[] = [
  { score: 1.57, truth: "unanswerable", text: "How do we handle a DNS resolution failure?" },
  { score: 2.8, truth: "unanswerable", text: "What is the connection pool ceiling for events-bus?" },
  { score: 4.48, truth: "answerable", text: "What is the connection pool ceiling for orders-db?" },
  { score: 6.22, truth: "answerable", text: "What severity is a tier 0 service being unavailable?" },
  { score: 7.88, truth: "answerable", text: "db.pool.wait_ms is climbing on orders-db — what is happening?" },
  { score: 8.85, truth: "unanswerable", text: "How long is the observation period between regions?" },
];

/** The finding the pins make unavoidable. */
const OVERLAP =
  "The highest-scoring question here is one the corpus cannot answer. It beats two " +
  "questions that genuinely can be. No single threshold separates them, which is why " +
  "the middle band exists and why 87% of questions land in it.";

/** The second uncomfortable fact, and the one that makes the deferral rate
 *  concrete. Drag below 0.74 to see an outright refusal — none of the real
 *  probes goes there, including a question about a topic the corpus never
 *  mentions at all. */
const NO_CLEAN_REFUSAL =
  "Not one of these six is refused outright. Even the DNS question — a topic the corpus " +
  "never mentions — scores 1.57 against a 0.74 floor, so it defers. Drag below 0.74 to " +
  "see a refusal; nothing real lands there.";

const BANDS = [
  {
    id: "insufficient",
    label: "Refuse",
    chip: "chip--blocked",
    plain: "It says it cannot answer, and produces nothing at all.",
    deep: "No draft is generated. A refusal that still emits a draft is not a refusal — the console can only display what the graph emitted, which is what D-009 fixed.",
  },
  {
    id: "ambiguous",
    label: "Defer",
    chip: "chip--refused",
    plain: "It answers, but flags the answer as partial rather than confident.",
    deep: "Routes to an explicit adjudication step. Never silently upgraded to sufficient — reading ambiguous as a soft yes is how a three-state assessment collapses back into the two-state one it replaced.",
  },
  {
    id: "sufficient",
    label: "Answer",
    chip: "chip--grounded",
    plain: "It answers, with a citation beside every claim.",
    deep: "Every sentence must resolve to a retrieved passage. An unresolvable marker is kept and flagged rather than deleted, because a fabricated citation looks exactly like grounding.",
  },
] as const;

function bandFor(score: number) {
  if (score < INSUFFICIENT_BELOW) return BANDS[0];
  if (score >= SUFFICIENT_ABOVE) return BANDS[2];
  return BANDS[1];
}

const pos = (score: number) => `${Math.min((score / AXIS_MAX) * 100, 100)}%`;

export default function EvidenceGate() {
  const [score, setScore] = useState(4.48);
  const [pinned, setPinned] = useState<Probe | null>(PROBES[2] ?? null);
  const sliderId = useId();
  const band = bandFor(score);

  function choose(probe: Probe) {
    setScore(probe.score);
    setPinned(probe);
  }

  return (
    <figure className="gate" aria-labelledby={`${sliderId}-caption`}>
      <figcaption id={`${sliderId}-caption`} className="gate-caption">
        <span className="mono gate-tag">try it</span>
        Drag the score, or pick a real question, and watch what the system does.
      </figcaption>

      {/* The axis. Zones are drawn from the same constants the runtime uses. */}
      <div className="gate-axis" aria-hidden="true">
        <span className="gate-zone gate-zone--blocked" style={{ width: pos(INSUFFICIENT_BELOW) }} />
        <span
          className="gate-zone gate-zone--refused"
          style={{ width: `calc(${pos(SUFFICIENT_ABOVE)} - ${pos(INSUFFICIENT_BELOW)})` }}
        />
        <span className="gate-zone gate-zone--grounded grow"/>

        {PROBES.map((probe) => (
          <button
            key={probe.text}
            type="button"
            className="gate-pin"
            data-truth={probe.truth}
            data-on={pinned?.text === probe.text ? "true" : "false"}
            style={{ left: pos(probe.score) }}
            onClick={() => choose(probe)}
            aria-label={`${probe.text} — scores ${probe.score}, ${probe.truth}`}
            title={`${probe.score} · ${probe.truth}`}
          />
        ))}

        <span className="gate-marker" style={{ left: pos(score) }} />
      </div>

      <label className="gate-slider-label" htmlFor={sliderId}>
        <span className="visually-hidden">Evidence score</span>
        <input
          id={sliderId}
          className="gate-slider"
          type="range"
          min={0}
          max={AXIS_MAX}
          step={0.01}
          value={score}
          onChange={(event) => {
            setScore(Number(event.target.value));
            setPinned(null);
          }}
          aria-valuetext={`${score.toFixed(2)} — ${band.label}`}
        />
      </label>

      <div className="gate-readout" aria-live="polite">
        <div className="gate-verdict">
          <span className="mono gate-score">{score.toFixed(2)}</span>
          <span className={`chip ${band.chip}`}>{band.label}</span>
        </div>
        <p className="gate-plain">{band.plain}</p>
        <p className="gate-deep">{band.deep}</p>
        {pinned && (
          <p className="gate-probe">
            <span className="mono gate-probe-tag" data-truth={pinned.truth}>
              {pinned.truth}
            </span>
            {pinned.text}
          </p>
        )}
      </div>

      <div className="gate-questions">
        {PROBES.map((probe) => (
          <button
            key={probe.text}
            type="button"
            className="gate-question"
            data-truth={probe.truth}
            data-on={pinned?.text === probe.text ? "true" : "false"}
            onClick={() => choose(probe)}
          >
            <span className="mono gate-question-score">{probe.score.toFixed(2)}</span>
            {probe.text}
          </button>
        ))}
      </div>

      <p className="gate-overlap">
        <span className="mono gate-overlap-tag">the hard part</span>
        {OVERLAP}
      </p>

      <p className="gate-overlap">
        <span className="mono gate-overlap-tag">and the cost of it</span>
        {NO_CLEAN_REFUSAL}
      </p>

      <p className="mono gate-src">
        thresholds: retrieval/evidence.py · scores measured against the live corpus
      </p>
    </figure>
  );
}
