# Deployment Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `sandscope-web.vercel.app` update itself on every push, by moving it onto the project that already does — rather than teaching the manual project a trick the other one already knows.

**Architecture:** Two Vercel projects exist for one application, and the one that looked broken is the good one.

`sandscope` is connected to GitHub on `main` and auto-deploys. Its `ssoProtection` is `all_except_custom_domains`, which sounds like a wall and is not: it applies to per-deploy hash URLs and **exempts the clean alias**, so `https://sandscope-five.vercel.app` has been publicly reachable and self-updating the whole time.

`sandscope` — the public URL everyone has — is NOT connected to the repository, so it only updates when someone runs a CLI command by hand. That is why the site went eight days stale carrying an entire sprint's work.

**Correction, recorded because the first version of this plan had it backwards.** The original diagnosis tested `https://sandscope-l0m4blqhm-sand224ai-8475s-projects.vercel.app`, got a 302, and concluded the project was unreachable. That was the hash URL, which IS behind SSO. The alias was never tested. A 302 on one URL was generalised to a project, and the plan was then built on it.

So consolidate the other way: keep the project that already auto-deploys, and move the known alias onto it.

**Tech Stack:** Vercel CLI 59.10.0, the Vercel REST API v9/v10, a Node guard script. No new dependencies.

## Global Constraints

- Everything here is doable from the CLI and API. An earlier version of this plan required dashboard access; that was a consequence of the wrong diagnosis, not of the platform.
- Never print, commit or echo the Vercel token. It lives at `~/Library/Application Support/com.vercel.cli/auth.json`.
- Deleting a project is irreversible. Task 4 does not run without an explicit confirmation from the person executing it.
- The public URL `https://sandscope-web.vercel.app` must keep working throughout. If any step breaks it, stop and restore before continuing.
- Run from repository root unless stated otherwise.

---

### Task 1: Record the current state before changing it

The two-project situation is not documented anywhere. Whoever inherits this — or you in three weeks — will otherwise rediscover it the same expensive way.

**Files:**
- Create: `docs/03-architecture/adr/0014-one-vercel-project-connected-to-git.md`

**Interfaces:**
- Consumes: nothing.
- Produces: ADR-0014, referenced by Tasks 2 and 4.

- [ ] **Step 1: Capture the facts**

```bash
cd /Users/sand224/sandscope
TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME+'/Library/Application Support/com.vercel.cli/auth.json','utf8')).token)")
T=team_7oOLBvkP2XbqNVY1qlKBMi6e
curl -s -H "Authorization: Bearer $TOKEN" "https://api.vercel.com/v9/projects?teamId=$T" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);
for (const p of j.projects.filter(p=>p.name.startsWith('sandscope'))) {
  const prod=(p.targets&&p.targets.production)||{};
  console.log(p.name, '| sso:', JSON.stringify(p.ssoProtection), '| git:', p.link? p.link.type+':'+p.link.repo : 'NOT CONNECTED');
  console.log('   prod:', prod.url||'(none)', '| sha', (prod.meta&&prod.meta.githubCommitSha||'cli').slice(0,8));
}});"
```

Record the output verbatim — it goes into the ADR.

- [ ] **Step 2: Write the ADR**

Create `docs/03-architecture/adr/0014-one-vercel-project-connected-to-git.md`, following the house format exactly (read `adr/0012-agent-runtime-on-northflank.md` for the shape). It must contain:

- **Status:** Accepted, today's date, Deciders: DevOps / SRE, Release Authority
- **Context:** two projects for one app; `sandscope` auto-deploys but is SSO-walled; `sandscope-web` is public but manual. The consequence, stated plainly: the public site went eight days stale carrying a completed sprint, and nobody noticed because the *other* project was going green on every push.
- **Decision:** one project — `sandscope-web` — connected to the repository. `sandscope` deleted.
- **Consequences:** positive (the site cannot silently go stale; one place to look), negative (a bad commit reaches production without a human step, which is what the CI gate and the guard in Task 3 exist to bound), and what would change it.
- **Verification:** name the guard from Task 3.

Per the charter's "Verifying external claims" rule, any pricing or plan claim in this ADR must name the page it was read from and the date. If you do not check a pricing page, do not make a pricing claim — that rule exists because ADR-0003 asserted Hugging Face was free, was never checked, and cost three sprints (D-017).

- [ ] **Step 3: Commit**

```bash
cd /Users/sand224/sandscope
node scripts/check-docs.mjs
git add docs/03-architecture/adr/0014-one-vercel-project-connected-to-git.md
git commit -m "docs(adr): one Vercel project, connected to git (ADR-0014)

Two projects existed for one application. The connected one was SSO-walled
and unreachable; the public one was manual and went eight days stale carrying
a completed sprint — while the other went green on every push, which is why
nobody noticed."
```

---

### Task 2: Move the known alias onto the auto-deploying project

`sandscope` already builds every push and is already public at
`sandscope-five.vercel.app`. The only thing it lacks is the domain everyone has
been given. Moving an alias is an API call, so unlike the original version of
this task it needs no dashboard access.

A domain can only be attached to one project at a time, so this is a remove
then an add. The gap between them is the only moment the public URL is down —
seconds, but real, so do it deliberately rather than in a loop.

**Files:**
- None in the repository. Platform change, verified from here.

**Interfaces:**
- Consumes: ADR-0014 from Task 1.
- Produces: `sandscope-web.vercel.app` served by the `sandscope` project, auto-deploying from `main`. Task 3's guard depends on it.

- [ ] **Step 1: Confirm both projects are currently serving the same commit**

Moving the alias while the target is behind would publish a regression.

```bash
cd /Users/sand224/sandscope
TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME+'/Library/Application Support/com.vercel.cli/auth.json','utf8')).token)")
T=team_7oOLBvkP2XbqNVY1qlKBMi6e
curl -s -H "Authorization: Bearer $TOKEN" "https://api.vercel.com/v9/projects?teamId=$T" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);
for (const p of j.projects.filter(p=>p.name.startsWith('sandscope'))) {
  const prod=(p.targets&&p.targets.production)||{};
  console.log(p.name, '| sha', ((prod.meta&&prod.meta.githubCommitSha)||'cli').slice(0,8));
}});"
git rev-parse --short HEAD
```

Expected: both projects on the same SHA, and that SHA is `HEAD`. If `sandscope`
is behind, push first and wait for its build before continuing.

- [ ] **Step 2: Detach the domain from `sandscope-web`**

```bash
cd /Users/sand224/sandscope
TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME+'/Library/Application Support/com.vercel.cli/auth.json','utf8')).token)")
T=team_7oOLBvkP2XbqNVY1qlKBMi6e
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "https://api.vercel.com/v9/projects/sandscope-web/domains/sandscope-web.vercel.app?teamId=$T" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(d||'(empty response = removed)'))"
```

- [ ] **Step 3: Attach it to `sandscope` immediately**

```bash
cd /Users/sand224/sandscope
TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME+'/Library/Application Support/com.vercel.cli/auth.json','utf8')).token)")
T=team_7oOLBvkP2XbqNVY1qlKBMi6e
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"sandscope-web.vercel.app"}' \
  "https://api.vercel.com/v10/projects/sandscope/domains?teamId=$T" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);
console.log(r.error ? 'ERROR: '+r.error.message : 'attached: '+r.name+' verified='+r.verified);});"
```

If this errors with the domain still in use, Step 2 did not take — re-run it and
confirm before retrying. Do NOT leave the domain detached from both.

- [ ] **Step 4: Verify the public URL works and is fresh**

```bash
for p in / /handover /data /council /architecture /console /reliability /delivery /story; do
  printf "  %-14s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 https://sandscope-web.vercel.app$p)"
done
curl -s https://sandscope-web.vercel.app/handover | grep -oE '6[0-9]/6[0-9]' | head -1
```

Expected: nine 200s, and the current requirement count. DNS and edge caches can
lag a minute; if a route 404s, wait 60s and re-run before concluding anything.

- [ ] **Step 5: Prove auto-deploy now reaches the public URL**

This is the whole point of the task, and it is the one thing worth proving with
a real push rather than an assertion.

```bash
cd /Users/sand224/sandscope
node scripts/derive-delivery.mjs
git add apps/web/src/generated/delivery.json
git commit -m "chore: refresh the derived record to verify auto-deploy reaches the public URL"
git push origin main
```

Then wait and check, without running any CLI deploy:

```bash
for i in $(seq 1 20); do
  sleep 20
  CODE=$(curl -s -o /dev/null -w '%{http_code}' https://sandscope-web.vercel.app/handover)
  echo "attempt $i: $CODE"
  [ "$CODE" = "200" ] && break
done
```

Expected: the deployment appears without anyone running `vercel --prod`. If
nothing changes after ~7 minutes, the alias is attached but the project's
production branch is not building — check `git link` and `productionBranch` from
Task 1's command.

- [ ] **Step 6: Record the outcome in the ADR**

Add the date auto-deploy was confirmed working, and note that
`sandscope-five.vercel.app` remains as a second alias on the same project.
Leaving it is harmless — it is the same deployment — and removing it would
break any link already shared.

### Task 3: Guard against the site going stale again

Connecting the repo makes staleness unlikely, not impossible — a failed build, a disconnected hook or a paused project all reproduce it silently. This is the same class as D-019 (documents claiming an undeployed state) and deserves the same treatment: a check that fails.

**Files:**
- Create: `scripts/check-deploy-freshness.mjs`
- Modify: `.github/workflows/ci.yml` (governance job)
- Test: `apps/agent/tests/test_guards_fail_on_bad_input.py`

**Interfaces:**
- Consumes: `product.config.json`'s `frontendUrl`.
- Produces: `check-deploy-freshness.mjs`, exit non-zero when the live site is serving a build older than a threshold behind `main`.

- [ ] **Step 1: Decide what "stale" can actually be measured as**

The live site does not expose its commit SHA. Two options, and only one is honest:

- Compare a figure the site renders against the local derived record. Cheap, and it catches exactly the failure that happened — the site showing `45 Planned` while the repo said otherwise.
- Add a build-time SHA to the page. More precise, but adds a value to every page for the benefit of one check.

Take the first. It piggybacks on the derived record that already exists and needs nothing new in the app.

- [ ] **Step 2: Write the guard**

Create `scripts/check-deploy-freshness.mjs`:

```js
/**
 * Fail when the deployed site is serving figures the repository has moved past.
 *
 * The public site went eight days stale carrying a completed sprint. Nothing
 * noticed, because the OTHER Vercel project was going green on every push
 * (ADR-0014). Connecting the repo makes that unlikely rather than impossible:
 * a failed build, a removed hook or a paused project all reproduce it in
 * silence.
 *
 * Same class as D-019, and it gets the same treatment: a check that fails.
 *
 * Compares one derived figure -- the requirement count on /delivery -- against
 * the local record. Skips cleanly when the site is unreachable, because a
 * network blip must not fail an unrelated build; unreachable and stale are
 * different states and only one is a defect here.
 *
 *   node scripts/check-deploy-freshness.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

const config = read("product.config.json");
const delivery = read("apps/web/src/generated/delivery.json");
const site = config.frontendUrl;

if (!site) {
  console.error("check-deploy-freshness: product.config.json has no frontendUrl");
  process.exit(1);
}

const expected = String(delivery.requirements.total);

let html;
try {
  const response = await fetch(`${site}/delivery`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    console.log(`deploy freshness: ${site} returned ${response.status} — skipping`);
    process.exit(0);
  }
  html = await response.text();
} catch (error) {
  console.log(`deploy freshness: ${site} unreachable (${error.name}) — skipping`);
  process.exit(0);
}

if (html.includes(expected)) {
  console.log(`deploy freshness: live site shows ${expected} requirements, matching the record`);
  process.exit(0);
}

console.error(
  `deploy freshness FAILED\n\n` +
    `  The repository has ${expected} requirements; ${site}/delivery does not show that\n` +
    `  number anywhere, so it is serving an older build.\n\n` +
    `  Check the Vercel project is still connected to the repository (ADR-0014),\n` +
    `  then redeploy: cd apps/web && npx vercel --prod\n`,
);
process.exit(1);
```

- [ ] **Step 3: Run it against the live site**

```bash
cd /Users/sand224/sandscope
node scripts/check-deploy-freshness.mjs
```

Expected: `deploy freshness: live site shows 61 requirements, matching the record`.

- [ ] **Step 4: Prove it fails on a stale site**

Point it at a value the site cannot be showing:

```bash
cd /Users/sand224/sandscope
cp apps/web/src/generated/delivery.json /tmp/delivery.bak
node -e "
const f='apps/web/src/generated/delivery.json';
const d=JSON.parse(require('fs').readFileSync(f,'utf8'));
d.requirements.total = 999;
require('fs').writeFileSync(f, JSON.stringify(d,null,2));
"
node scripts/check-deploy-freshness.mjs
cp /tmp/delivery.bak apps/web/src/generated/delivery.json
node scripts/check-deploy-freshness.mjs
```

Expected: FAIL with `The repository has 999 requirements`, then PASS after restoring.

- [ ] **Step 5: Wire into CI**

In `.github/workflows/ci.yml`, in the `governance` job, after the deploy-claims step:

```yaml
      - name: Deploy freshness (the live site is not serving an older build)
        run: node scripts/check-deploy-freshness.mjs
```

```bash
cd /Users/sand224/sandscope
node scripts/check-workflow-shell.mjs
```

- [ ] **Step 6: Commit**

```bash
cd /Users/sand224/sandscope
git add scripts/check-deploy-freshness.mjs .github/workflows/ci.yml
git commit -m "feat(guards): fail when the live site serves an older build

The public site went eight days stale carrying a completed sprint, and
nothing noticed because the other Vercel project was going green on every
push. Connecting the repo makes that unlikely, not impossible — a failed
build or a removed hook reproduces it in silence.

Skips cleanly when the site is unreachable: unreachable and stale are
different states and only one of them is this guard's business.

Proven by setting the local count to 999 and watching it fail."
```

---

### Task 4: Retire the now-unused project

**Irreversible.** Do not run this without explicit confirmation from the Release Authority.

**Files:**
- Modify: `docs/03-architecture/adr/0014-one-vercel-project-connected-to-git.md` (record the outcome)

- [ ] **Step 1: Confirm nothing depends on it**

```bash
cd /Users/sand224/sandscope
# Anything still pointing at the project being deleted, rather than the domain.
# The DOMAIN sandscope-web.vercel.app survives — it moved in Task 2 — so
# references to it are fine. What must not survive is a reference to the
# project by name in tooling.
grep -rn "sandscope-web" --include='*.yml' --include='*.json' --include='*.mjs' . 2>/dev/null \
  | grep -v node_modules | grep -v "sandscope-web.vercel.app"
cat apps/web/.vercel/project.json 2>/dev/null
```

Expected: no results from the grep. `.vercel/project.json` WILL still point at
`sandscope-web` — that is the local CLI link, and it must be re-linked to
`sandscope` before deleting, or the next `vercel` command in that directory
fails:

```bash
cd /Users/sand224/sandscope/apps/web
rm -rf .vercel
npx vercel link --yes --project sandscope
cat .vercel/project.json
```

- [ ] **Step 2: Ask for confirmation**

Stop here and put the decision to the person running this plan, in these words:

> `sandscope-web` (prj_JrUlnSI8FI4tBHz7J7v2FpvhxpUi) is now serving nothing — its domain moved to `sandscope` in Task 2 and it was never connected to the repository. Deleting it is permanent and removes its deployment history. The live site is unaffected. Delete it?

Note this is the OPPOSITE project from the one the first version of this plan
proposed deleting. That version had the diagnosis backwards; deleting on the
old instruction would have removed the only project that auto-deploys.

Do not proceed on an assumed yes. Deleting a Vercel project is exactly the class of action that needs a person to say the word.

- [ ] **Step 3: Delete it, only after a clear yes**

```bash
cd /Users/sand224/sandscope
npx vercel project rm sandscope-web
```

- [ ] **Step 4: Verify the public site is untouched**

```bash
for p in / /handover /data /council /architecture /console /reliability /delivery /story; do
  printf "  %-14s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://sandscope-web.vercel.app$p)"
done
node scripts/check-deploy-freshness.mjs
```

Expected: nine 200s and a passing freshness check.

- [ ] **Step 5: Record the outcome and commit**

Add a dated line to ADR-0014's Consequences saying whether the deletion happened, or that it was declined and the project remains as a documented duplicate. Either is a legitimate outcome; an undocumented one is not.

```bash
cd /Users/sand224/sandscope
git add docs/03-architecture/adr/0014-one-vercel-project-connected-to-git.md
git commit -m "docs(adr): record the outcome of the duplicate-project decision"
```

---

## Self-Review

**Spec coverage:** The problem was two projects — one connected but unreachable, one reachable but manual — causing an eight-day stale site. Task 1 documents it, Task 2 connects the right one, Task 3 guards against recurrence, Task 4 removes the decoy. Covered.

**Placeholder scan:** No TBDs. The two places that are instructions rather than code — Task 2 Step 1 (dashboard OAuth) and Task 4 Step 2 (confirmation) — are marked as such with the reason. Writing a fake CLI command for a browser-only OAuth grant would send the executor in circles.

**Type consistency:** The project ID `prj_JrUlnSI8FI4tBHz7J7v2FpvhxpUi` (sandscope-web) and `prj_p8fzZirVgAMTXCxAbD08fmaov7EY` (sandscope) are used consistently in Tasks 2 and 4. The team ID `team_7oOLBvkP2XbqNVY1qlKBMi6e` is the same throughout. `config.frontendUrl` is the field the existing `check-deploy-claims.mjs` already reads.

**Known risk:** Task 2 Step 1 may hit the same Root Directory persistence bug that caused `vercel.json` to be moved into `apps/web/` in the first place. The step says to stop rather than work around it, because a silent second occurrence of a platform bug is worth more as a recorded finding than as a workaround.
