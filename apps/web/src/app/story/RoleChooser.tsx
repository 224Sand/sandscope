"use client";

import { useState } from "react";
import { ROLES } from "./roles";

/**
 * "Whose story do you want?"
 *
 * The interaction is the argument: a project is not one narrative, it is a dozen
 * people disagreeing about the same events. Picking a role resolves that role's
 * MANDATE — what they were accountable for across the whole build — and a real
 * timeline of moments where that accountability showed up, in the order it
 * actually happened.
 *
 * This replaced a one-moment version after the person the page was built for
 * looked at it and said it read as thin. It was: a role that appears once
 * across nine sprints is a footnote, not a thread. Every moment below still
 * cites a real artefact — the fix for "thin" is more real content, never
 * invented texture.
 *
 * Transitions go through the View Transitions API where it exists, which is a
 * browser primitive rather than an animation library — no bundle cost, and it
 * degrades to an instant swap where it doesn't exist. Under reduced motion the
 * transition is skipped entirely rather than shortened, because a cross-fade
 * that is merely faster is still motion.
 */
export default function RoleChooser() {
  // QA opens by default: its timeline includes the sharpest single moment in
  // the project (a suite reporting 0% when the real rate was 56.6%).
  const [activeId, setActiveId] = useState("qa");
  const active = ROLES.find((r) => r.id === activeId) ?? ROLES[0];

  // Indexing can be undefined under the strict config. An empty roster means
  // there is genuinely nothing to show, so render nothing rather than assert
  // the array is populated and crash the surface if it ever is not.
  if (!active) return null;

  function choose(id: string) {
    if (id === activeId) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => void;
    };

    if (!reduced && typeof doc.startViewTransition === "function") {
      doc.startViewTransition(() => setActiveId(id));
    } else {
      setActiveId(id);
    }
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Choose a role"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--s2)",
          marginBottom: "var(--s6)",
        }}
      >
        {ROLES.map((r) => {
          const on = r.id === activeId;
          return (
            <button
              key={r.id}
              role="tab"
              aria-selected={on}
              onClick={() => choose(r.id)}
              className="role-tab"
              data-on={on ? "true" : "false"}
            >
              {r.role}
            </button>
          );
        })}
      </div>

      <article className="panel role-panel" style={{ viewTransitionName: "role-panel" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "var(--s4)",
            flexWrap: "wrap",
          }}
        >
          <h3 style={{ fontSize: "1.5rem" }}>{active.role}</h3>
          <span className="mono dim finest">
            {active.short}
          </span>
        </header>

        <p style={{ color: "var(--text)", fontSize: "1.125rem", marginTop: "var(--s4)" }}>
          {active.plain}
        </p>

        <dl className="role-meta">
          <div>
            <dt>Owns</dt>
            <dd>{active.owns}</dd>
          </div>
          <div>
            <dt>Produced</dt>
            <dd>{active.produced.join(" · ")}</dd>
          </div>
        </dl>

        <p className="role-mandate">{active.mandate}</p>

        <hr className="hairline rule-65"/>

        <p className="mono role-timeline-label">
          Their thread — {active.moments.length} moment{active.moments.length === 1 ? "" : "s"} across the build
        </p>

        <ol className="role-timeline">
          {active.moments.map((m, i) => (
            <li key={m.citation + i} className="role-moment">
              <div className="role-moment-rail" aria-hidden="true">
                <span className="role-moment-dot" />
                {i < active.moments.length - 1 && <span className="role-moment-line" />}
              </div>
              <div className="role-moment-body">
                <span className="mono role-moment-sprint">{m.sprint}</span>
                <h4 className="role-moment-title">{m.title}</h4>
                <p className="role-moment-what">{m.what}</p>
                <p className="role-sowhat">{m.soWhat}</p>
                <p className="mono role-moment-cite">cited: {m.citation}</p>
              </div>
            </li>
          ))}
        </ol>
      </article>
    </div>
  );
}
