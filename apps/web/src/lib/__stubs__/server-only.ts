/**
 * Test-only stand-in for the `server-only` package.
 *
 * `server-only` exists to THROW when a module that reads secrets is imported
 * from client code — that guard is the reason `env.ts` cannot leak the
 * inter-service token into a browser bundle (T-12), and it is correct.
 *
 * It also makes the module impossible to import in a unit test. This stub is
 * aliased in `vitest.config.ts` only: the real package stays in place for
 * `next build`, so the protection it provides is unchanged where it matters.
 */
export {};
