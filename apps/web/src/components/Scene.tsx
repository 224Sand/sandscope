/**
 * A pinned scene. One idea per viewport.
 *
 * The next scene does not begin until this one has landed, which is the second
 * transferable thing about the reference standard: it refuses to put two claims
 * on screen at once.
 *
 * Content is present in the DOM and legible with animation removed. Motion
 * changes emphasis, never availability (AC-C10).
 *
 * That last sentence was FALSE for as long as this component reveal itself in
 * JavaScript (D-021). The previous version held an `IntersectionObserver` and
 * a `visible` state that started `false`, so the server-rendered markup — the
 * markup a reader sees before hydration, with JavaScript disabled, or when
 * hydration fails as it did in D-008 — carried an inline `opacity: 0` on every
 * scene. Measured with JavaScript off, all seven scenes on the landing page
 * computed to `opacity: 0`: the content was present in the DOM, exactly as the
 * docstring promised, and completely invisible, which is what the docstring
 * promised it would never be.
 *
 * The reveal is now the CSS `.reveal` class, which `/story` already used and
 * which has none of that failure mode: it declares no base hidden state at all
 * (the from-state lives inside the keyframes), it is gated behind BOTH
 * `@supports (animation-timeline: view())` and
 * `@media (prefers-reduced-motion: no-preference)`, and it runs on the
 * compositor rather than the main thread. No JavaScript, no observer, no
 * hydration dependency — a browser that does not animate it simply shows it.
 *
 * This component no longer needs to be a client component.
 */

export default function Scene({
  kicker,
  heading,
  body,
  aside,
  media,
}: {
  kicker: string;
  heading: string;
  body: string;
  aside?: React.ReactNode;
  /** Ambient background clip name, from public/media. Optional by design: a
   *  scene whose argument is carried by a table does not need footage behind
   *  it, and putting video behind every section is texture rather than
   *  emphasis. */
  media?: string;
}) {
  return (
    <section className="scene hairline-top" >
      {media && (
        /* Poster-first, video lazily. The clip is decoration: it must never
           delay the text, and it is muted/inert so it cannot demand attention
           the content has not earned. Hidden entirely under reduced motion —
           a looping background is motion whether or not it was asked for. */
        <div className="scene-media" aria-hidden="true">
          <video
            className="scene-video"
            src={`/media/${media}.mp4`}
            poster={`/media/${media}.jpg`}
            autoPlay
            muted
            loop
            playsInline
            preload="none"
          />
          <div className="scene-scrim" />
        </div>
      )}
      <div
        className="wrap reveal"
        style={{
          paddingBlock: "var(--s9)",
          display: "grid",
          gap: "var(--s7)",
          // auto-fit with a min track rather than a 768px breakpoint: the
          // aside carries monospace tables that clip long before the viewport
          // reaches tablet width, and a breakpoint chosen from device sizes
          // rather than from the content is a breakpoint that will be wrong.
          gridTemplateColumns: aside
            ? "repeat(auto-fit, minmax(min(100%, 400px), 1fr))"
            : "1fr",
          alignItems: "start",
        }}
      >
        <div>
          <p className="mono dim mb-4" >
            {kicker.toUpperCase()}
          </p>
          <h2 style={{ marginBottom: "var(--s5)", maxWidth: "18ch" }}>{heading}</h2>
          <p style={{ color: "var(--text-2)", fontSize: "1.125rem" }}>{body}</p>
        </div>
        {aside}
      </div>
    </section>
  );
}
