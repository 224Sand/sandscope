import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Unit tests for the edge layer's library code.
 *
 * `apps/web/src/lib` had no unit tests of any kind until Sprint 9 — the whole
 * app had no unit runner. Playwright covers it end to end now, but the rate
 * limiter's most important behaviour cannot be reached that way: it FAILS
 * CLOSED when the store is unreachable (ADR-0007), and simulating an
 * unreachable Redis through a browser means arranging a real outage. That is
 * exactly the shape of the defect this project already logged twice — D-013
 * was a rate-limit pen test that passed while the service was DOWN, because
 * nothing distinguished "refused correctly" from "not running".
 *
 * Node environment, not jsdom: this is server-only code and giving it a fake
 * DOM would let a `window` reference compile that production would throw on.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Playwright's specs live in e2e/ and are driven by its own runner. Vitest
    // would happily collect them and then fail on `test.describe` semantics it
    // does not share.
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
      // `server-only` throws by design when imported outside a React Server
      // Component. That guard is correct in the app and makes the module
      // untestable, so it is stubbed here — the ONE thing this alias must not
      // do is hide a real client-side import, which is why it is scoped to
      // the test config and not to tsconfig or next.config.
      "server-only": resolve(import.meta.dirname, "./src/lib/__stubs__/server-only.ts"),
    },
  },
});
