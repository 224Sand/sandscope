/**
 * The motion budget, in one place.
 *
 * It was stated in DESIGN_SYSTEM.md, restated in scripts/fetch-media.mjs, and
 * described in both as "enforced in CI" while no workflow ever looked at a
 * media file. Two copies of a number and no check is how a budget becomes a
 * sentence about a budget.
 *
 * Relaxed from 4s / 2.5MB in Sprint 9. See fetch-media.mjs for why.
 */
export const BUDGET = { seconds: 7, bytes: 4.5 * 1024 * 1024, width: 1920 };

/** Tolerance on the muxed duration: a 7s cut lands a frame or two either side. */
export const DURATION_SLACK_SECONDS = 0.25;
