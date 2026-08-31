# Threat Model

**Version:** 1.0 · **Author:** Security Engineer · **Date:** 2026-08-20
**Method:** STRIDE over the container diagram in [TECH_SPEC.md](../03-architecture/TECH_SPEC.md) §2
**Status:** DRAFT — awaiting sign-off

---

## 1. Scope and assets

A publicly reachable demonstration system holding no personal data and no
customer data. The assets worth protecting are therefore not records but
**capabilities and credentials**:

| Asset | Why it matters |
|---|---|
| LLM provider API keys | Direct financial and quota value if exfiltrated |
| Inter-service bearer secret | Grants direct access to the agent runtime, bypassing the BFF's rate limits |
| Model call capability | The endpoint is free LLM capacity to an abuser (NFR-004) |
| Database credentials | Corpus and trace integrity |
| Delivery record integrity | The product's central claim is that the record is real; forged evidence would be the worst possible failure |

Explicitly **not** assets: user PII (none collected), customer data (synthetic),
uptime (a demo).

## 2. Trust boundaries

1. Browser → BFF. Fully untrusted input.
2. BFF → agent runtime. Authenticated; the browser must never cross this directly.
3. Agent runtime → LLM providers. Outbound; responses are untrusted input.
4. Agent runtime → Postgres/Redis. Credentialed.
5. Build → Pexels/GitHub. Build-time only, never request-time.

## 3. STRIDE analysis

| # | Threat | Category | Vector | Mitigation | Residual |
|---|---|---|---|---|---|
| T-1 | Abuser drives unbounded model spend | DoS / cost | Scripted requests to the run endpoint | Per-IP sliding window; daily token ceiling; spend guard refuses without an open budget; both **fail closed** (ADR-0007) | Low |
| T-2 | Provider keys exfiltrated | Information disclosure | Keys reaching the client bundle or logs | Keys live only in the runtime's environment; the BFF holds the inter-service secret; secret scanner blocks commits; structured logs redact by key name | Low |
| T-3 | Agent runtime called directly, bypassing rate limits | Elevation of privilege | Guessing the Space URL | Bearer token on every `/v1/*` route, constant-time comparison; unauthenticated requests rejected before any work | Low |
| T-4 | Prompt injection via retrieved corpus | Tampering | Malicious text inside a document chunk | Corpus is build-time seeded and immutable at runtime; no user-supplied documents; retrieved content is delimited and never granted instruction authority | Low |
| T-5 | Prompt injection via incident description | Tampering | Visitor-supplied incident text | Visitor input is constrained to selection and bounded free text; the orchestrator treats all retrieved and user content as data; no tool has write access to any real system | Medium — accepted, no tool can act externally |
| T-6 | Chaos endpoint used to degrade the demo for others | DoS | Repeated provider-failure injection | Injection is session-scoped and rate-limited; it can never disable a provider globally | Low |
| T-7 | Trace or approval records forged | Tampering / repudiation | Direct database write | Application-only write paths; approvals carry timestamp and session identity; runs are append-only | Medium — a demo-grade identity model, stated as such |
| T-8 | Delivery record misrepresented | Repudiation | Hand-written CI or test numbers | Delivery surface reads the GitHub API live; the traceability gate blocks untested requirements | Low |
| T-9 | Session correlation from IP | Information disclosure | Storing raw client IP | IPs stored as salted hashes only; no raw IP persisted anywhere | Low |
| T-10 | Dependency supply chain | Tampering | Malicious transitive package | Pinned lockfiles; minimal dependency surface (the router, cache, BM25 and embedder are first-party); Dependabot on | Medium |
| T-11 | Model output triggers unintended action | Elevation of privilege | Model emits a remediation command | **No tool executes against any real system.** Remediation is text. Risk-gated actions additionally require terminal human approval (ADR-0006) | Low |

## 4. The two that shape the architecture

**T-1** is the reason ADR-0007 exists. The instinctive default of failing open on
a limiter outage is exactly wrong here: it converts a dependency blip into an
unbounded-cost event on a publicly known endpoint.

**T-11** is the reason the product proposes rather than executes. A control plane
that could restart a service would be a more impressive demo and a materially
worse design decision, and the honest version is the one that ships.

## 5. Secrets handling

Secrets exist only as environment variables — in Vercel project settings, in HF
Space secrets, and in an untracked local `.env`. `.env.example` carries
placeholder values and is the only env file in git. `check-secrets.mjs` runs on
every push and blocks on match. No secret is ever logged, echoed into an error
message, or included in a trace attribute.

## 6. Review triggers

This model is revisited when: any tool gains write access to an external system;
user-supplied documents enter the corpus; authentication is added; or a new trust
boundary appears. Absent those, it is reviewed once at Sprint 6 hardening.

---

# Addendum — Sprint 5: the public browser surface

**Date:** 2026-08-20 · **Trigger:** §6, "a new trust boundary appears"

Sprints 0–4 produced a library. Sprint 5 puts a browser in front of it, which
adds a boundary that did not exist and changes the exposure of two threats
already recorded.

## New surface

| | |
|---|---|
| Browser → BFF | Fully untrusted. Anyone on the internet. |
| BFF → agent runtime | Authenticated; the browser must never cross it directly. |

## Threats

| # | Threat | Vector | Mitigation | Residual |
|---|---|---|---|---|
| **T-12** | The inter-service token reaches the browser | Passing it to a client component, or into a `NEXT_PUBLIC_*` variable | The token is read only in route handlers, never in a component. A test greps the built client bundle for it and fails the build on a match. | Low |
| **T-13** | The runtime is called directly, bypassing the BFF's rate limit | The Space URL is discoverable | Bearer auth on every `/v1/*` route (T-3), plus the per-IP limit is the BFF's job and the daily token ceiling is the runtime's, so neither depends on the other | Low |
| **T-14** | SSE connections held open to exhaust the runtime | Opening many streams and never reading | Per-IP concurrent-stream cap; server-side timeout on any run exceeding its budget. A stream is not free just because it is idle. | Medium |
| **T-15** | A run's free-text body used to smuggle instructions | Prompt injection through the incident description | Retrieved content and user content are both delimited and neither is granted instruction authority. **No tool can act on any real system** (T-11), so the worst outcome is a wrong answer rather than a wrong action. Body length is capped at 4,000 characters, which is also a cost bound. | Medium — accepted |
| **T-16** | A secret reaches a trace attribute and is rendered | Span attributes are shown in the UI | The span exporter has an allowlist of attribute keys; anything else is dropped rather than redacted, because a redaction that fails is invisible | Low |
| **T-17** | Approval forged or replayed | Posting an approval for someone else's run | An approval is bound to the session that created the run; a decision for an unknown or foreign run is rejected. Demo-grade identity, stated as such. | Medium — accepted |

## Two changes to existing entries

**T-1 (unbounded model spend) moves from Low to Medium residual.** It was
theoretical while nothing was deployed. Once a URL exists it is a matter of
someone finding it. The mitigations are unchanged and now actually matter: per-IP
sliding window failing **closed** (ADR-0007), a daily token ceiling, and a spend
guard that refuses without an open budget.

**T-9 (session correlation from IP) is unchanged and worth restating.** The BFF
now sees every visitor's address for rate limiting. It is hashed with a salt
before it reaches storage and the raw value never leaves the request scope.

## The control that carries the most weight

**T-11 — no tool executes against any real system.** Every threat involving
prompt injection, forged approvals or a compromised model resolves to "the
attacker obtains a wrong sentence" rather than "the attacker obtains an action".

That is a design decision with a cost: the product proposes and never executes,
which makes the demonstration less impressive than it could be. It is also why
this threat model is short.

---

## Re-tested against the deployed surface — 2026-08-31 (S8-THREAT)

The assessment above was made against a design. This section records which
threats have now been tested against the **running** system, which cannot be
tested from here, and which remain deliberately accepted.

Added as a dated section rather than edited in place. The original was a
design-time judgement and remains a true record of what was believed then;
overwriting it would destroy the comparison that makes a re-test worth doing.

| Threat | Status | Evidence |
|---|---|---|
| **T-1** unbounded spend | **Verified** | The limiter was observed refusing a live request: `{"error":"limit_exceeded"}`. See `PENTEST_RESULTS.md` |
| **T-3** runtime called directly | **Verified** | `GET /v1/providers` on the public runtime returns `401` |
| **T-9** IP correlation | **Verified** | No `x-forwarded-for`, `x-real-ip` or `client-ip` header echoed in any live response |
| **T-12** token reaches the browser | **Verified** | Zero occurrences of the token name in the delivered page; P-2 passes against production |
| **T-15** injection via the body | **Verified** | P-5 passes against production — a crafted body does not override grounding |
| **T-4** injection via the corpus | Deferred | The corpus is build-time seeded and immutable at runtime; there is no path to inject one remotely, so there is nothing to test from outside |
| **T-11** model triggers an action | Deferred | Structural: no tool executes against any real system. Testable only by adding one, which is the thing being avoided |
| **T-16** secret in a trace attribute | Deferred | The exporter uses an allowlist. Confirming a negative remotely would need a secret to plant |
| **T-2** key exfiltration | Deferred | Covered by the secret scanner in CI, which now runs with a root argument and has a test proving it catches a planted credential |
| **T-6** chaos degrades others | **Verified by design change** | Injection is scoped per RUN, not per session — the router is built inside the stream handler and discarded. There is no state to leak |
| **T-14** SSE exhaustion | **Accepted** | Unchanged. Medium residual, stated at design time and still true |
| **T-17** approval forged | **Accepted** | Unchanged. Demo-grade identity, recorded as such |
| **T-5, T-7, T-8, T-10, T-13** | Unchanged | No new evidence either way; the design-time assessment stands |

### One thing the re-test changed

**T-1 is verified by a different route than intended.** The probe that tries to
*trigger* the limit cannot run against a hosted target — every probe shares one
address behind the edge, so it would be testing the harness's own machine.

What verified T-1 instead was the limiter refusing a normal request, observed
directly. Watching a control engage is better evidence than a test that has to
manufacture the conditions for it, and in this case it is the only evidence
available. Recorded because the method matters as much as the verdict.

### What would change these

The five Deferred rows all need something the deployment deliberately lacks: a
mutable corpus, a real tool, a plantable secret. Each would be testable in a
system that had those, and each is deferred precisely because this one does
not. That is worth stating rather than leaving as an untested row that reads
like an oversight.
