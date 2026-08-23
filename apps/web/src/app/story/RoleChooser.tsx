"use client";

import { useState } from "react";
import { ROLES } from "./roles";

/**
 * "Whose story do you want?"
 *
 * The interaction is the argument: a project is not one narrative, it is a dozen
 * people disagreeing about the same events. Picking a role resolves that role's
 * thread through the whole build — what they owned, what they produced, and the
 * one moment where their concern turned out to matter.
 *
 * Transitions go through the View Transitions API where it exists, which is a
 * browser primitive rather than an animation library — no bundle cost, and it
 * degrades to an instant swap where it doesn't exist. Under reduced motion the
 * transition is skipped entirely rather than shortened, because a cross-fade
 * that is merely faster is still motion.
 */
export default function RoleChooser() {
  // QA opens by default: its thread (a suite reporting 0% when the real rate
  // was 56.6%) is the sharpest single moment in the project.
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
          <span className="mono" style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>
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

        <hr className="hairline" style={{ margin: "var(--s5) 0" }} />

        <p className="mono" style={{ color: "var(--text-3)", fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Where it mattered
        </p>
        <h4 style={{ fontSize: "1.125rem", marginTop: "var(--s3)" }}>{active.moment.title}</h4>
        <p style={{ color: "var(--text-2)", marginTop: "var(--s3)" }}>{active.moment.what}</p>

        <p className="role-sowhat">{active.moment.soWhat}</p>

        <p className="mono" style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: "var(--s4)" }}>
          cited: {active.moment.citation}
        </p>
      </article>
    </div>
  );
}
