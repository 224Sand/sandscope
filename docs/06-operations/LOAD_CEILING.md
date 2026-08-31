# Load ceiling and failure mode

**Owner:** DevOps / SRE · **Date:** 2026-08-31 · **Story:** S8-LOAD

Every ceiling in this system **refuses**. None of them bills. That is the whole
claim, and each one below names the component that enforces it and the test
that asserts it, because a ceiling document saying "it refuses" without naming
the proof is exactly the unverified claim this project spends its guards
refusing to make.

## The ceilings

| Ceiling | Value | Enforced by | At the limit | Asserted by |
|---|---|---|---|---|
| Requests per address | **20 / hour** | `apps/web/src/lib/ratelimit.ts` | `429 limit_exceeded` | `ratelimit.test.ts` |
| Spend per run | **$0.02** | `orchestrator/budget.py` | the call is refused before it is made | `test_a_live_call_is_refused_with_no_budget_open` |
| Request body, at the edge | **8 KB** | `api/runs/stream/route.ts` | `413`, before the runtime is contacted | `test_bff_body_ceiling_is_not_looser_than_the_runtime_accepts` |
| Incident text, at the runtime | **4,000 chars** | `RunRequest.body` | `422`, before retrieval or any model call | `test_an_oversized_body_is_rejected` |
| Subject | **200 chars** | `RunRequest.subject` | `422` | same |

## Why refusal rather than degradation

The limiter **fails closed** (ADR-0007). When its store is unreachable the
request is refused, not allowed through. The instinctive default is the
opposite — keep serving when a dependency blips — and that default converts a
Redis outage into an unbounded-cost incident and turns a public endpoint into
free model capacity for whoever finds it.

For a demonstration the correct trade is unavailability. For a revenue-bearing
service it would not be, and that difference is the point of recording it.

The spend guard reserves against the **most expensive provider that could still
serve**, before the call. Pricing the first candidate under-reserved by 4× the
moment failover reached a costlier model (D-010).

## Verified in production

The per-address limit was observed engaging against the live deployment on
2026-08-31, during the S8-E2E run:

```
$ curl -X POST https://sandscope-web.vercel.app/api/runs/stream -d '{"probe":"x"}'
{"error":"limit_exceeded","detail":"hourly limit reached for this address"}
```

That refusal is the evidence. See `docs/05-security/PENTEST_RESULTS.md` for why
observing the limiter refuse is the honest remote test, and why the probe that
tries to *trigger* it cannot run behind an edge proxy.

## What is NOT bounded

Stated because a ceiling document that lists only the ceilings that exist is
the same omission this project keeps guarding against:

- **Concurrent SSE streams per address.** T-14 in the threat model, rated
  Medium and accepted. A client opening many streams and never reading them
  consumes runtime capacity that the per-request limiter does not see.
- **Total daily spend across all visitors.** The per-run ceiling bounds one
  run; nothing aggregates. The practical bound is the per-address hourly limit
  multiplied by the number of distinct addresses, which is not a designed
  ceiling so much as an emergent one.
- **Corpus growth.** The retrieval index is rebuilt at startup. At 87 chunks
  that is milliseconds; there is no test asserting where it stops being.
