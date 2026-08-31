# ADR-0014 — One Vercel project, connected to git

**Status:** Accepted · **Date:** 2026-08-31 · **Deciders:** DevOps / SRE, Release Authority (D-019)

## Context

Two Vercel projects existed for one application, and the arrangement hid a
staleness failure for eight days.

| | `sandscope` | `sandscope-web` |
|---|---|---|
| Git connected | github:224Sand/sandscope @main | **not connected** |
| Deploys on push | yes | no — manual CLI only |
| Public alias | `sandscope-five.vercel.app` | `sandscope-web.vercel.app` |
| `ssoProtection` | `all_except_custom_domains` | `null` |

`sandscope-web` is the URL that was shared, and it only updated when somebody
ran `vercel --prod` by hand. It therefore went **eight days stale carrying a
completed sprint** — 45 requirements still shown as Planned after an audit had
moved the real number — and nobody noticed, because `sandscope` was going green
on every push the whole time.

**A diagnosis error is recorded here because it nearly reversed this decision.**
The first investigation tested
`https://sandscope-l0m4blqhm-sand224ai-8475s-projects.vercel.app`, received a
302, and concluded `sandscope` was behind a login wall and unusable. That is a
per-deploy hash URL, and `all_except_custom_domains` applies to exactly those
while **exempting the clean alias**. The alias was never tested. One URL's
status was generalised to a whole project, and a plan was written on it that
would have deleted the only project that auto-deploys. The Product Owner
caught it by pointing out that `sandscope-five.vercel.app` works.

## Decision

**One project, connected to the repository: `sandscope`.** The
`sandscope-web.vercel.app` alias moves onto it, so the URL everyone has keeps
working and starts updating itself.

Consolidating the other way — connecting `sandscope-web` — was rejected: it
requires a dashboard OAuth grant, while moving an alias is an API call, and it
would mean teaching the manual project a trick the other one already does.

## Consequences

**Positive.** The public site cannot silently go stale; a push is a deploy.
One project to look at rather than two, one of which was a decoy. No manual
step to forget.

**Negative.** A bad commit reaches production without a human gate. That is
bounded by CI — a red pipeline blocks merge, and merge is what deploys — and by
`check-deploy-freshness.mjs`, but it is a real reduction in ceremony and worth
naming rather than glossing.

**`sandscope-five.vercel.app` remains** as a second alias on the same project.
Harmless — it serves the identical deployment — and removing it would break any
link already shared.

**What would change this.** If production ever needs a human release gate, the
answer is a protected branch or a promotion step, not a disconnected project
that someone remembers to deploy.

## Verification

`scripts/check-deploy-freshness.mjs` fails the build when the live site serves
a figure the repository has moved past. It skips cleanly when the site is
unreachable, because unreachable and stale are different states and only one
of them is a defect.
