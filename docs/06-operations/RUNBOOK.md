# Runbook

**Owner:** DevOps / SRE · **Date:** 2026-08-31 · **Story:** S8-OBS

Every failure mode this system actually has, with the command that diagnoses it
and the response. Not hypotheticals — each one below has either happened or is
a documented threat with a human response.

## Is anything wrong?

Two commands answer that.

```bash
# Runtime alive, corpus loaded?
curl -s https://p01--sandscope-agent--ql6pdjy9fhnj.code.run/healthz

# Can the edge reach it, and which providers are up?
curl -s https://sandscope-web.vercel.app/api/providers
```

Healthy looks like `{"status":"ok","corpus_ready":true}` and a provider list
with at least one `"available": true`.

---

## The runtime is asleep or unreachable

**Symptom.** The console shows "The agent runtime is asleep or unreachable."
`/api/providers` returns 503.

**Check.** `curl -s .../healthz` — no response or a timeout.

**Response.** Expected on a free tier (R-01) and self-correcting: the next
request wakes it, taking roughly 30 seconds. If it does not recover, check the
Northflank service is running. The site stays up throughout — every surface
except the console is static and does not touch the runtime.

**Threats covered:** none. This is availability, not security.

---

## A provider is rate-limiting or down

**Symptom.** Runs still complete. `/api/providers` shows one or more entries
with `"available": false` and a `disabled_reason`.

**Check.** The provider list above, or the trace on a completed run — it names
which provider served.

**Response.** None required. The router disables a rate-limited provider for a
**bounded** interval and moves to the next in the fixed chain. Intervene only if
ALL five are unavailable, at which point runs fail closed rather than silently
degrade.

**Threats covered:** T-2 (keys), indirectly.

---

## The rate limiter cannot reach Redis

**Symptom.** Every run request returns 503 with
`{"error":"limiter_unavailable"}`. The site loads; the console cannot run.

**Check.**
```bash
curl -s -X POST https://sandscope-web.vercel.app/api/runs/stream -d '{"probe":"x"}'
```

**Response.** **This is correct behaviour, not an incident to work around**
(ADR-0007). The limiter fails closed: an outage becomes unavailability rather
than free model capacity for whoever finds the endpoint. Restore Upstash. Do
not "temporarily" disable the limiter — that converts a dependency blip into an
unbounded-cost incident, which is the exact trade the ADR rejects.

**Threats covered:** T-1.

---

## The database is unreachable

**Symptom.** Runs stream and complete normally, but `run_completed` carries
`"persisted": false` and session memory stays empty.

**Check.** The memory panel on `/console` shows "Memory is unavailable."

**Response.** Persistence is best-effort by design and never blocks a run — a
database outage degrades the RECORD, not the run the visitor is watching.
Restore Neon. Runs during the outage are unrecoverable; they were streamed and
not stored, and nothing pretends otherwise.

**Threats covered:** T-7 (repudiation) is weakened while this persists.

---

## The spend ceiling is reached

**Symptom.** A run ends with a `BudgetExhaustedError` in its error event.

**Check.** The run's ledger shows reserved versus actual.

**Response.** Working as designed. `RUN_BUDGET_USD` defaults to $0.02 per run
and the guard reserves against the worst-case surviving provider before
calling. If legitimate runs are hitting it, raise the ceiling deliberately —
**never to zero**, which prevents startup by design rather than killing every
run mid-stream (D-007).

**Threats covered:** T-1.

---

## The corpus fails to load at startup

**Symptom.** `/healthz` returns `"corpus_ready": false`; every run returns 503
`"corpus not loaded"`.

**Check.** Runtime logs at startup.

**Response.** The index is rebuilt from the corpus at startup rather than
persisted (NFR-005), so this means the corpus files are missing from the image.
Redeploy. There is no cache to clear — that is the point of rebuilding.

---

## The live site is serving an older build

**Symptom.** A figure on the site disagrees with the repository.

**Check.** `node scripts/check-deploy-claims.mjs` and compare
`/delivery` against the local `delivery.json`.

**Response.** See ADR-0014. The site went eight days stale once because the
public project was not connected to the repository, and nothing noticed.

---

## Threat-model coverage

Every threat whose response requires a human appears above: T-1 (limiter,
spend), T-2 (providers), T-7 (persistence). The rest are enforced by controls
that need no runbook entry — T-3, T-4, T-5, T-9, T-11, T-12, T-16 are
structural, and T-14, T-15, T-17 are recorded as **accepted** rather than
mitigated, so there is no response to document. That is a deliberate absence,
not a gap.
