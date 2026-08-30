# Deployment Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public site update itself on push, and delete the duplicate project that has been silently building every commit into somewhere nobody can reach.

**Architecture:** Two Vercel projects exist for one application. `sandscope` is connected to GitHub and auto-deploys, but sits behind an SSO wall so every route 302s to a login page. `sandscope-web` is the public URL with SSO correctly off, but is not connected to the repo — so it only updates when someone runs a CLI command by hand, which is why the site went eight days stale carrying an entire sprint's work. Consolidate onto `sandscope-web`, connect it, then remove the decoy.

**Tech Stack:** Vercel CLI 59.10.0, the Vercel REST API v9/v10, a Node guard script. No new dependencies.

## Global Constraints

- **Parts of this need the Vercel dashboard and cannot be automated from here.** Those steps are written as instructions for a human and say so explicitly. Do not fabricate a CLI equivalent.
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

### Task 2: Connect `sandscope-web` to the repository

**This step requires the Vercel dashboard.** Connecting a git repository needs an OAuth grant between Vercel and GitHub; there is no CLI or API path that can establish it from here, and pretending otherwise would waste your time.

**Files:**
- None in the repository. This is a platform change, verified from here.

**Interfaces:**
- Consumes: ADR-0014 from Task 1.
- Produces: `sandscope-web` auto-deploying from `main`. Task 3's guard depends on it.

- [ ] **Step 1: Connect it (human, in the browser)**

1. Open https://vercel.com/sand224ai-8475s-projects/sandscope-web/settings/git
2. Under **Connected Git Repository**, connect `224Sand/sandscope`
3. Set **Production Branch** to `main`
4. Set **Root Directory** to `apps/web`

Root Directory matters and has bitten this project before: `vercel.json` was moved into `apps/web/` precisely because a dashboard Root Directory setting would not persist. If it refuses to save again, stop — do not work around it — and record what happened, because that is the same platform bug returning.

- [ ] **Step 2: Verify the connection took, from here**

```bash
cd /Users/sand224/sandscope
TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME+'/Library/Application Support/com.vercel.cli/auth.json','utf8')).token)")
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.vercel.com/v9/projects/prj_JrUlnSI8FI4tBHz7J7v2FpvhxpUi?teamId=team_7oOLBvkP2XbqNVY1qlKBMi6e" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d);
console.log('git link :', p.link ? p.link.type+':'+p.link.org+'/'+p.link.repo : 'NOT CONNECTED');
console.log('branch   :', p.link && p.link.productionBranch);
console.log('root dir :', p.rootDirectory);
console.log('sso      :', JSON.stringify(p.ssoProtection));});"
```

Expected: `git link : github:224Sand/sandscope`, `branch : main`, `root dir : apps/web`, `sso : null`.

If `sso` is anything other than `null`, connecting re-enabled Deployment Protection. Disable it before continuing, or the public URL starts 302ing to a login wall:

```bash
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"ssoProtection": null}' \
  "https://api.vercel.com/v9/projects/prj_JrUlnSI8FI4tBHz7J7v2FpvhxpUi?teamId=team_7oOLBvkP2XbqNVY1qlKBMi6e" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log('sso now:', JSON.stringify(JSON.parse(d).ssoProtection)))"
```

- [ ] **Step 3: Prove auto-deploy works with a real push**

Make a trivial, honest change — do not push an empty commit, because an empty commit does not prove a build ran:

```bash
cd /Users/sand224/sandscope
node scripts/derive-delivery.mjs
git add apps/web/src/generated/delivery.json
git commit -m "chore: refresh the derived record to verify auto-deploy"
git push origin main
```

- [ ] **Step 4: Watch the deployment appear without running a CLI deploy**

```bash
cd /Users/sand224/sandscope
SHA=$(git rev-parse --short HEAD)
for i in $(seq 1 20); do
  OUT=$(npx vercel ls sandscope-web 2>/dev/null | grep -m1 "Production")
  echo "$OUT"
  echo "$OUT" | grep -q "Ready" && break
  sleep 20
done
curl -s -o /dev/null -w "public URL: %{http_code}\n" https://sandscope-web.vercel.app/handover
```

Expected: a deployment created within a minute or two of the push, without you running `vercel --prod`. If nothing appears after ~7 minutes, the connection did not take — return to Step 1.

- [ ] **Step 5: Commit nothing; record the result**

There is nothing to commit here beyond Step 3's push. Note in the ADR whether auto-deploy was confirmed working, with the date.

---

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

### Task 4: Delete the decoy project

**Irreversible.** Do not run this without explicit confirmation from the Release Authority.

**Files:**
- Modify: `docs/03-architecture/adr/0014-one-vercel-project-connected-to-git.md` (record the outcome)

- [ ] **Step 1: Confirm nothing depends on it**

```bash
cd /Users/sand224/sandscope
grep -rn "sandscope-five\|sandscope\.vercel\.app" --include='*.ts' --include='*.tsx' --include='*.md' --include='*.json' --include='*.yml' . 2>/dev/null | grep -v node_modules | grep -v "sandscope-web"
```

Expected: no results. Any hit is a reference that will break — fix it before deleting.

- [ ] **Step 2: Ask for confirmation**

Stop here and put the decision to the person running this plan, in these words:

> `sandscope` (prj_p8fzZirVgAMTXCxAbD08fmaov7EY) is the SSO-walled duplicate. Deleting it is permanent and removes its deployment history. `sandscope-web` is unaffected. Delete it?

Do not proceed on an assumed yes. Deleting a Vercel project is exactly the class of action that needs a person to say the word.

- [ ] **Step 3: Delete it, only after a clear yes**

```bash
cd /Users/sand224/sandscope
npx vercel project rm sandscope
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
