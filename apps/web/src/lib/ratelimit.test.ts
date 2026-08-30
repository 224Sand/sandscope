import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * NFR-004 — the public endpoint survives untrusted traffic without unbounded
 * cost.
 *
 * The behaviour that matters here is the one an end-to-end test cannot reach:
 * what the limiter does when its STORE is unreachable. ADR-0007 says it fails
 * closed, and the whole argument for that trade is that a Redis outage becomes
 * unavailability rather than free LLM capacity for whoever finds the endpoint.
 * Reproducing it in a browser would mean arranging a real outage.
 *
 * This project has been bitten by the same shape before. D-013 was a
 * rate-limit pen test that PASSED while the service was down, because its pass
 * condition accepted any status >= 400 and could not tell "refused correctly"
 * from "not running". The lesson encoded below is that the REASON for a
 * refusal is part of the assertion, not colour: every test here checks
 * `decision.reason`, never just `allowed === false`.
 *
 * The module is re-imported per test because its limiter instance is
 * module-level and memoised — asserting the not-configured path after a
 * configured one would otherwise read a client cached by the previous test.
 */

const REDIS_ENV = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"] as const;

/** What the mocked limiter's `limit()` does for the test in hand. */
let limitBehaviour: () => Promise<{ success: boolean; remaining: number }> = () =>
  Promise.resolve({ success: true, remaining: 19 });

// The module is mocked rather than the method spied on. `limit` is assigned
// per instance inside the Ratelimit constructor rather than defined on the
// prototype, so `vi.spyOn(Ratelimit.prototype, "limit")` fails with "the
// property is not defined on the object" — accurately, and for a reason that
// has nothing to do with the code under test.
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = () => ({});
    limit = () => limitBehaviour();
  },
}));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));

function request(forwardedFor = "198.51.100.9"): Request {
  return new Request("https://example.com/api/runs/stream", {
    method: "POST",
    headers: { "x-forwarded-for": forwardedFor },
  });
}

async function freshModule() {
  vi.resetModules();
  return import("./ratelimit");
}

/** Configured, so a limiter is constructed and its behaviour is what varies. */
function configured(): void {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
}

describe("the rate limiter", () => {
  beforeEach(() => {
    for (const name of REDIS_ENV) delete process.env[name];
    limitBehaviour = () => Promise.resolve({ success: true, remaining: 19 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("when the store is unreachable", () => {
    beforeEach(() => {
      configured();
      limitBehaviour = () => Promise.reject(new Error("ECONNREFUSED"));
    });

    test("it denies rather than allowing through", async () => {
      const { check } = await freshModule();
      expect((await check(request())).allowed).toBe(false);
    });

    test("it says WHY it denied, so an outage is not read as a rate limit", async () => {
      /** D-013's actual lesson. A caller that cannot tell "you are over the
       *  limit" from "the limiter is down" retries the first forever and pages
       *  nobody about the second — and the route uses this reason to choose
       *  between returning 429 and 503. */
      const { check } = await freshModule();
      const decision = await check(request());
      expect(decision.reason).toBe("limiter_unavailable");
      expect(decision.reason).not.toBe("limit_exceeded");
    });

    test("it reports no remaining quota rather than a stale number", async () => {
      const { check } = await freshModule();
      expect((await check(request())).remaining).toBe(0);
    });
  });

  describe("when the store answers", () => {
    beforeEach(configured);

    test("a request within the limit is allowed", async () => {
      limitBehaviour = () => Promise.resolve({ success: true, remaining: 19 });
      const { check } = await freshModule();
      expect(await check(request())).toMatchObject({
        allowed: true,
        reason: "allowed",
        remaining: 19,
      });
    });

    test("a request over the limit is refused as a LIMIT, not as an outage", async () => {
      limitBehaviour = () => Promise.resolve({ success: false, remaining: 0 });
      const { check } = await freshModule();
      const decision = await check(request());
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("limit_exceeded");
    });
  });

  describe("when it is not configured at all", () => {
    test("production refuses — an unlimited public endpoint is what this prevents", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const { check } = await freshModule();
      const decision = await check(request());
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("not_configured");
    });

    test("development allows, so the console runs with no managed services", async () => {
      vi.stubEnv("NODE_ENV", "development");
      const { check } = await freshModule();
      const decision = await check(request());
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe("not_configured");
    });
  });

  describe("identify", () => {
    test("the raw address never appears in the identifier", async () => {
      /** The limiter needs to tell visitors apart, not identify them (T-9). */
      const { identify } = await freshModule();
      const id = identify(request());
      expect(id).not.toContain("198.51.100.9");
      expect(id).toHaveLength(32);
    });

    test("the same address maps to the same identifier", async () => {
      const { identify } = await freshModule();
      expect(identify(request())).toBe(identify(request()));
    });

    test("different addresses do not collide", async () => {
      const { identify } = await freshModule();
      expect(identify(request())).not.toBe(identify(request("203.0.113.7")));
    });

    test("only the first forwarded hop is used", async () => {
      /** `x-forwarded-for` is caller-controlled and can carry a list. Using
       *  the whole header would let a client change its own identifier by
       *  appending to it — a rate limit that resets on request. */
      const { identify } = await freshModule();
      expect(identify(request("198.51.100.9, 203.0.113.7, 192.0.2.1"))).toBe(
        identify(request()),
      );
    });
  });
});
