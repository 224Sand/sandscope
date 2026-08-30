"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Lets the reader set how deep the whole document goes (FR-033).
 *
 * The page serves a stakeholder and an architect from one source. Per-section
 * disclosure handles that, but it makes the architect click twelve times to
 * read the document they actually came for, and it leaves a non-technical
 * reader unsure whether they are missing something.
 *
 * IMPORTANT: this changes EMPHASIS, never AVAILABILITY (AC-C10, and the design
 * system's central motion rule). "Plain" collapses the deep blocks; it does not
 * remove them from the DOM, hide them from ctrl-F, or take them out of the
 * accessibility tree. There is deliberately no `display: none` anywhere in this
 * feature — that would make the page's own claim about layered depth false, on
 * the page that explains the project.
 *
 * Without JavaScript this component renders nothing and every block stays
 * individually openable, which is the behaviour the page had before it existed.
 * A control that becomes a broken affordance with scripts off is worse than an
 * absent one.
 */

type Depth = "plain" | "full";
const STORAGE_KEY = "sandscope.handover.depth";

export default function DepthControl() {
  // Rendered only after mount. The preference lives in localStorage, so
  // deciding on the server would guess — and a guess that disagrees with the
  // client is a hydration mismatch, which is exactly D-024.
  const [mounted, setMounted] = useState(false);
  const [depth, setDepth] = useState<Depth>("plain");

  const apply = useCallback((next: Depth) => {
    for (const block of Array.from(document.querySelectorAll<HTMLDetailsElement>("details.deep"))) {
      block.open = next === "full";
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    let stored: Depth = "plain";
    try {
      stored = window.localStorage.getItem(STORAGE_KEY) === "full" ? "full" : "plain";
    } catch {
      // Private browsing, or storage disabled. A remembered preference is a
      // convenience; failing to read one is not a reason to render nothing.
    }
    setDepth(stored);
    apply(stored);
  }, [apply]);

  function choose(next: Depth) {
    setDepth(next);
    apply(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* nothing to do — the control still works for this visit */
    }
  }

  if (!mounted) return null;

  return (
    <div className="depth" role="group" aria-label="Reading depth">
      <span className="mono depth-label">Read as</span>
      {(
        [
          ["plain", "Plain English", "Skips the parameters. Everything still findable."],
          ["full", "Full technical", "Opens every thresholds-and-tradeoffs block."],
        ] as const
      ).map(([value, label, hint]) => (
        <button
          key={value}
          type="button"
          className="depth-option"
          data-on={depth === value ? "true" : "false"}
          aria-pressed={depth === value}
          title={hint}
          onClick={() => choose(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
