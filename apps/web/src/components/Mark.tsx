/**
 * The SandScope mark.
 *
 * Same idea as the favicon (src/app/icon.svg), drawn as a component so the
 * masthead and the tab show the same thing — a logo that only exists as a
 * favicon reads as an afterthought, and one that drifts from its favicon reads
 * as two products.
 *
 * The mark is the product's single idea: three evidence bands and a gate that
 * stops at the third. SUFFICIENT answers, AMBIGUOUS answers but flags,
 * INSUFFICIENT emits nothing — so the third bar is cut short and the aperture
 * ring is left open at the bottom. An agent that refuses is drawn as a scope
 * that does not close.
 *
 * `currentColor` on the ring lets it inherit the surrounding text colour, so it
 * sits correctly in the nav and at larger sizes without a second variant. The
 * three band colours are semantic and stay fixed — they mean the same thing
 * here as they do on every chip across the site.
 */
export default function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="SandScope"
      style={{ display: "block", flexShrink: 0 }}
    >
      <path
        d="M32 11a21 21 0 1 1-14.8 35.9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="21" y="24" width="22" height="4.5" rx="2.25" fill="var(--grounded)" />
      <rect x="21" y="33" width="22" height="4.5" rx="2.25" fill="var(--refused)" />
      <rect x="21" y="42" width="9" height="4.5" rx="2.25" fill="var(--blocked)" />
    </svg>
  );
}
