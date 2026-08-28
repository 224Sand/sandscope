/**
 * The role threads behind /story's perspective chooser.
 *
 * Every `moments[].citation` is a real artefact in this repository — a defect
 * ID, an ADR, a sprint review. That constraint is the point: a role-perspective
 * feature is trivially fakeable, and a page of plausible-sounding invented
 * opinions is exactly the thing this project spent eighteen defects learning
 * not to ship. If a role has no real moment at a given point, it is skipped
 * there rather than padded with something invented.
 *
 * Each role carries a TIMELINE, not one incident — the first version of this
 * page picked the single sharpest moment per role, and it read as thin: a role
 * that shows up once across nine sprints is a footnote, not a thread. Following
 * a role here means watching them recur — a decision they made, a thing they
 * caught, a thing they missed — in the order it actually happened.
 *
 * `plain` is written for a reader with no engineering background. It is not a
 * simplified alternative to the technical text — it is the lede, and the detail
 * sits underneath it. Nobody is routed to a lesser version of the page.
 */

export type Moment = {
  sprint: string;
  title: string;
  citation: string;
  what: string;
  soWhat: string;
};

export type RoleThread = {
  id: string;
  role: string;
  short: string;
  owns: string;
  produced: string[];
  plain: string;
  /** What this role was actually accountable for across the whole build, in
   *  their own terms — the thing a hiring manager reading this role's row
   *  should take away even if they read nothing else. */
  mandate: string;
  moments: Moment[];
};

export const ROLES: RoleThread[] = [
  {
    id: "ba",
    role: "Business Analyst",
    short: "BA",
    owns: "Requirements, acceptance criteria, traceability",
    produced: ["BRD", "User stories", "Traceability matrix", "58 requirements"],
    plain:
      "Decides what 'done' means before anyone builds, and keeps a list proving every promise was kept — or admitting it wasn't.",
    mandate:
      "Every one of the 58 requirements in this project traces to an acceptance test by name. That rule produced a public admission that only 13 of them are actually done — the BA's job was making sure the other 45 stayed visible instead of getting rounded up.",
    moments: [
      {
        sprint: "Sprint 0",
        title: "58 requirements written before a line of product code existed",
        citation: "TRACEABILITY.md",
        what: "Every requirement names the specific test that will prove it, at a sprint when no product test could possibly exist yet.",
        soWhat: "Naming the test before the code exists is what makes 'Planned' later mean something specific rather than 'we'll get to it'.",
      },
      {
        sprint: "Sprint 2",
        title: "A 0% error rate should have been a question, not an answer",
        citation: "D-001",
        what: "The Sprint 2 gate accepted a refusal-gate test result of zero errors without the acceptance criteria requiring a minimum sample size behind it.",
        soWhat: "The gap was in what the BA wrote at Sprint 0, not only in how QA tested — acceptance criteria that don't demand a sample size let a convenient number pass unchallenged.",
      },
      {
        sprint: "Sprint 7",
        title: "Traceability statuses were wrong in both directions at once",
        citation: "D-014",
        what: "Four rows claimed a status the legend never defined and were still counted as done publicly; one row sat at 'Planned' while its test had passed for four sprints.",
        soWhat: "A status column maintained by hand drifts both ways. It is a build check now, not a habit.",
      },
      {
        sprint: "Sprint 8",
        title: "45 of 58 requirements are still Planned, published as such",
        citation: "TRACEABILITY.md",
        what: "The matrix states the real completion rate rather than a rounded one, on the same public page that lists what shipped.",
        soWhat: "An unmet requirement costs one screen. A requirement quietly marked done that isn't costs the reader's trust in every other number on the page.",
      },
    ],
  },
  {
    id: "pm",
    role: "Product Manager",
    short: "PM",
    owns: "Vision, scope, prioritisation, success metrics",
    produced: ["PRD", "Roadmap", "Release notes"],
    plain:
      "Decides what the product is for and — harder — what it deliberately will not do.",
    mandate:
      "Kept the product to one flagship workload instead of five shallow ones, then had to decide, sprint after sprint, whether a compelling-sounding feature actually served that workload or just felt like progress.",
    moments: [
      {
        sprint: "Sprint 0",
        title: "One workload, chosen on purpose",
        citation: "PRD.md §1",
        what: "The product demonstrates a single flagship workload — production incident triage — rather than a shallow spread of features.",
        soWhat: "Depth in one workload proves the engineering. Breadth across five would have proved only that five stubs can be written.",
      },
      {
        sprint: "Sprint 3",
        title: "A re-ranking experiment that looked like it did nothing",
        citation: "D-003",
        what: "An experiment meant to demonstrate improvement returned a null result — which the PM had to decide was worth investigating rather than quietly dropping as 'didn't pan out'.",
        soWhat: "The null result turned out to be two bugs stacked on each other. A product call to keep digging is what surfaced a real improvement the first read would have buried.",
      },
      {
        sprint: "Sprint 6",
        title: "Deciding the site needed a story surface, not just proof pages",
        citation: "SPRINT_09_PLAN.md",
        what: "The proof surfaces (delivery, reliability, architecture) demonstrate rigor to an engineer but exclude anyone without the background to read them.",
        soWhat: "A product that only speaks to one audience has excluded most of the people who'd decide whether to hire the person who built it.",
      },
    ],
  },
  {
    id: "tpm",
    role: "Technical Program Manager",
    short: "TPM",
    owns: "Charter, sprint plans, risks, dependencies",
    produced: ["Charter", "9 sprint plans", "Risk register"],
    plain:
      "Keeps the plan honest — what was committed, what actually shipped, and what is blocked on someone else.",
    mandate:
      "Ran nine sprints against a written charter, and is the role most directly implicated when the charter itself got skipped — twice, in a row, right after promising in writing not to let it happen again.",
    moments: [
      {
        sprint: "Sprint 0",
        title: "A charter that names who may not sign off their own work",
        citation: "WAYS_OF_WORKING.md",
        what: "The founding rule — a role may not approve its own output — is written before any role produces anything to approve.",
        soWhat: "A rule adopted after the first violation is a lesson. A rule adopted before the first opportunity to violate it is a charter.",
      },
      {
        sprint: "Sprint 5",
        title: "Spend was reserved against the wrong provider",
        citation: "D-010",
        what: "The spend guard priced the cheapest candidate provider rather than the worst-case surviving one, under-reserving budget by 4x the moment failover reached a costlier model.",
        soWhat: "A risk register that says 'spend is bounded' is only true if the bound accounts for the failure path, not the happy path.",
      },
      {
        sprint: "Sprint 7",
        title: "Two sprints were worked and shipped without ever being opened",
        citation: "D-016",
        what: "Sprints 6 and 7 had no planning ceremony and no plan document. The sprint numbers existed only inside defect-log entries until they were backfilled after the fact.",
        soWhat: "A previous retrospective had already committed, in writing, to raising exactly this. It relied on someone remembering, so it failed. It is a build check now — a sprint number cannot appear anywhere before its plan exists.",
      },
      {
        sprint: "Sprint 8",
        title: "A hosting decision that cost three sprints of deployment work",
        citation: "ADR-0003 → ADR-0012",
        what: "The runtime host was chosen 'because it is free' without the pricing page ever being checked. It later required paid access, invalidating the deployment tooling built against it.",
        soWhat: "A dependency risk that isn't logged isn't managed. This is now a standing charter rule: a pricing-dependent decision names the page and the date it was verified.",
      },
    ],
  },
  {
    id: "sm",
    role: "Scrum Master",
    short: "SM",
    owns: "Ceremonies, impediments, velocity",
    produced: ["9 sprint reviews", "9 retrospectives"],
    plain:
      "Watches the process itself rather than the product — and calls it out when the team quietly stops following its own rules.",
    mandate:
      "Wrote nine retrospectives, and the one that matters most is the one where a committed action from a previous retrospective was checked — and found to have been ignored.",
    moments: [
      {
        sprint: "Sprint 4",
        title: "The QA Definition of Done item had been enforced zero times",
        citation: "SPRINT_05_REVIEW.md",
        what: "A DoD item requiring end-to-end demonstration, not just description, had gone unchecked across four sprint reviews before the retrospective caught it.",
        soWhat: "A Definition of Done nobody audits is a wish list. Naming that it went unchecked is what turned it back into a gate.",
      },
      {
        sprint: "Sprint 5",
        title: "A commitment made in a retrospective, then not honoured",
        citation: "SPRINT_05_REVIEW.md",
        what: "The retrospective committed to raising a silent role as an impediment if it happened again. Two sprints later that is precisely what happened, unnoticed at the time.",
        soWhat: "A retrospective action nobody checks at the next retrospective is not an action. It is a wish with a due date attached to make it look like one.",
      },
      {
        sprint: "Sprint 7",
        title: "The pattern named directly: three defects were guards that could not fail",
        citation: "D-013, D-015",
        what: "A rate-limit test and a README checker both reported success while testing nothing, in the same sprint, by the same process.",
        soWhat: "This is a process-health finding, not a testing one: 'did we run this against something known to be broken' had not yet become a standing habit. Naming the pattern is what turned it into one.",
      },
    ],
  },
  {
    id: "architect",
    role: "Solutions Architect / FDE",
    short: "ARCH",
    owns: "System design, integration, deployment topology",
    produced: ["12 ADRs", "Tech spec", "Architecture diagrams"],
    plain:
      "Decides how the pieces fit together, and writes down why — including what each choice gave up.",
    mandate:
      "Wrote twelve architecture decisions and had to supersede one of them in public after it turned out to rest on a claim nobody had actually verified.",
    moments: [
      {
        sprint: "Sprint 1",
        title: "The experience layer is split from the agent runtime, on purpose",
        citation: "ADR-0001",
        what: "A cinematic web experience and a stateful multi-agent runtime are architecturally different problems, deployed and scaled independently from day one.",
        soWhat: "The split is why a Vercel outage and a Northflank outage are independent failures rather than one shared one.",
      },
      {
        sprint: "Sprint 5",
        title: "A semantic cache threshold that was wrong in both directions",
        citation: "ADR-0008",
        what: "A module-level similarity threshold of 0.86 was chosen because it 'looked like' the right number for a semantic cache — not measured. Real paraphrases scored 0.679–0.959; distinct questions scored −0.065–0.034.",
        soWhat: "A threshold belongs to whatever produced the scores it's applied to, not to the component consuming them. Moving it fixed a defect the component-level tests could never have caught.",
      },
      {
        sprint: "Sprint 8",
        title: "A hosting decision recorded without ever checking the price",
        citation: "ADR-0003 → ADR-0012",
        what: "The runtime was placed on a platform 'because it is free'. That claim was never read off the pricing page. It later moved behind a paid plan, invalidating three sprints of deployment work.",
        soWhat: "The rule that came out of it: a decision record depending on a third party's pricing must name the page it was read from, and the date.",
      },
    ],
  },
  {
    id: "dev",
    role: "Software Engineer",
    short: "DEV",
    owns: "Implementation",
    produced: ["The runtime", "The console", "357 tests"],
    plain:
      "Writes the code that has to actually be correct, independent of whether the plan around it was right.",
    mandate:
      "Implemented every layer of the system — router, retrieval, evidence gate, console — and is the role whose work every other role exists to check, by charter rule.",
    moments: [
      {
        sprint: "Sprint 3",
        title: "A classifier that got worse when it was calibrated",
        citation: "Sprint 3 postmortem",
        what: "Platt scaling — a standard technique — collapsed the sufficiency classifier's cross-validated AUC from 0.808 to 0.599. The obvious next hypothesis (data leakage) was wrong too.",
        soWhat: "The model ships uncalibrated on purpose, with the failed attempt documented rather than hidden, because the honest result was worse than the naive one and that's worth knowing.",
      },
      {
        sprint: "Sprint 5",
        title: "A retry loop that resent the identical prompt",
        citation: "D-005",
        what: "A retry meant to correct an uncited answer sent exactly the same prompt as the first attempt — the edge existed in the design, the feedback loop to fix it did not.",
        soWhat: "An edge case that's designed for but never wired up fails silently, which is worse than not designing for it at all.",
      },
      {
        sprint: "Sprint 9",
        title: "Three typographic voices shipped with no webfont underneath them",
        citation: "SPRINT_09_PLAN.md",
        what: "The type stack named fonts that exist only on Apple hardware. On Windows, the entire designed scale fell through to a generic system default for three sprints.",
        soWhat: "The fallback path is the one nobody tests, because it looks correct on the machine of the person who wrote it.",
      },
    ],
  },
  {
    id: "qa",
    role: "QA Lead",
    short: "QA",
    owns: "Test strategy, Definition of Done, defect triage",
    produced: ["Test plan", "Defect log", "18 logged defects"],
    plain:
      "Refuses to accept 'it works' without evidence — and is suspicious of evidence that is too convenient.",
    mandate:
      "Logged all 18 defects in this project, and the sharpest pattern in the log is that a third of them were checks that reported success while testing nothing at all.",
    moments: [
      {
        sprint: "Sprint 2",
        title: "A test suite that reported 0% errors when the real rate was 56.6%",
        citation: "D-001",
        what: "The refusal gate was measured on 22 questions written by the person who built it. On a larger, harder set it got 150 of 265 wrong.",
        soWhat: "The most dangerous test result is a good one from a sample you chose yourself.",
      },
      {
        sprint: "Sprint 5",
        title: "A defect that neither component's own tests could have found",
        citation: "D-006",
        what: "A semantic cache served a stale answer to a correction retry. Both the cache and the retry logic had correct, passing tests in isolation — nobody had tested the two together.",
        soWhat: "This is the strongest single argument in the whole project for running the assembled system rather than trusting unit coverage.",
      },
      {
        sprint: "Sprint 7",
        title: "Two guards that were built to confirm, not to detect",
        citation: "D-013, D-015",
        what: "A rate-limit pen test sent 8 requests against a limit of 20 and treated any error as a pass — so a dead service reported as correctly protected. A README checker searched for values as substrings, so a changed number could hide inside an unrelated one.",
        soWhat: "The standing rule that followed: a guard is not trusted until it has been run against the defect it claims to catch and observed to fail.",
      },
      {
        sprint: "Sprint 8",
        title: "A green pipeline that had never run the code under change",
        citation: "D-018",
        what: "CI had no job that built the web application. A framework upgrade reported ten green checks while the production build failed on every page.",
        soWhat: "A check that exercises none of the code under review isn't weak evidence — it's negative evidence, because it makes a reviewer more confident than they should be.",
      },
    ],
  },
  {
    id: "devops",
    role: "DevOps / SRE",
    short: "SRE",
    owns: "CI/CD, environments, observability, incident response",
    produced: ["3 CI/CD pipelines", "Dockerfile", "Two live deployments"],
    plain:
      "Makes sure it runs somewhere other than the laptop it was written on, and keeps running when something breaks.",
    mandate:
      "Deployed both halves of the system to production and personally hit the two platform-level surprises that came with it: a host that changed its pricing, and a dashboard setting that silently refused to save.",
    moments: [
      {
        sprint: "Sprint 7",
        title: "A shell comment silently truncated a security scan",
        citation: "D-011",
        what: "A comment placed inside a backslash-continued command ended the continuation early. The scanner ran without its intended exclusion, reported success, and the shell then failed on the orphaned flag — every visible signal pointed the wrong way.",
        soWhat: "Now a standing CI check: no comment may appear inside a shell line continuation, anywhere in the repository's workflows.",
      },
      {
        sprint: "Sprint 8",
        title: "The chosen hosting platform moved behind a paywall mid-build",
        citation: "D-017 / ADR-0012",
        what: "The original runtime host restricted the tier this project depended on. The Dockerfile, deploy scripts and README all carried platform-specific assumptions that then needed rewriting.",
        soWhat: "A decision that's cheap to reverse on paper isn't cheap to reverse in the tooling actually built on top of it.",
      },
      {
        sprint: "Sprint 8",
        title: "A dashboard setting that would not persist",
        citation: "commit history, Sprint 8",
        what: "The deploy platform's Root Directory setting silently refused to save through its own UI. The fix was to stop depending on it — restructure so the deploy root is fixed by which directory is deployed, not by a setting that can drift.",
        soWhat: "When a platform's own UI can't be trusted to hold a setting, the more robust fix is removing the dependency on the setting, not retrying the UI.",
      },
    ],
  },
  {
    id: "appsec",
    role: "Application Security Engineer",
    short: "SEC",
    owns: "Threat model, scanning, supply chain, penetration testing",
    produced: ["Threat model", "7 security CI jobs", "SBOM"],
    plain:
      "Assumes someone hostile will find this and asks what they could do with it.",
    mandate:
      "Ran the security pipeline that caught a shell-injection vulnerability in its own CI configuration, four real CVEs in the training dependencies, and a rate-limit test that couldn't actually detect anything.",
    moments: [
      {
        sprint: "Sprint 7",
        title: "A shell injection vulnerability inside the CI pipeline itself",
        citation: "security.yml, Sprint 7",
        what: "A workflow_dispatch input was interpolated directly into a run: block — a classic injection vector, found while hardening the security pipeline, not in application code.",
        soWhat: "The tool checking the code for vulnerabilities had one. Auditing your own tooling with the same rigor as the product is not optional.",
      },
      {
        sprint: "Sprint 7",
        title: "Four real CVEs, all in a dependency the runtime never ships",
        citation: "ADR-0009",
        what: "The training extras (`transformers` and friends) carried four known RCE advisories. The runtime closure — what actually ships to production — audits clean at zero, because training happens offline and models are served as ONNX.",
        soWhat: "A decision made for a completely different reason (serving cost) turned out to also be the security boundary. Worth knowing which of your architecture choices are doing double duty.",
      },
      {
        sprint: "Sprint 7",
        title: "A rate-limit test that passed while the service was down",
        citation: "D-013",
        what: "The check sent 8 requests against a limit of 20, and treated any error response as proof the limit worked — so a dead service reported as correctly protected.",
        soWhat: "Security controls are now verified by pointing them at something known to be broken and confirming they fail loudly, not just that they return something.",
      },
    ],
  },
  {
    id: "designer",
    role: "UX / UI Designer",
    short: "UX",
    owns: "Design system, layout, motion, accessibility",
    produced: ["Design tokens", "Motion spec", "Three typographic voices", "The mark"],
    plain:
      "Decides how it looks and, more importantly, whether a stranger can understand it without being told.",
    mandate:
      "Built the entire visual system twice — once for engineering credibility, once for readability by anyone who isn't an engineer — after the first version was reviewed and found wanting.",
    moments: [
      {
        sprint: "Sprint 6",
        title: "Motion that explains, or doesn't happen at all",
        citation: "DESIGN_SYSTEM.md",
        what: "The founding design rule: nothing on the site is reachable only by animating, and reduced-motion removes emphasis, never content.",
        soWhat: "A rule adopted before the first animation exists is a constraint. Adopted after, it's a patch.",
      },
      {
        sprint: "Sprint 9",
        title: "The site shipped for three sprints with no webfont",
        citation: "SPRINT_09_PLAN.md",
        what: "The type stack named fonts that exist only on Apple hardware. On Windows — most readers — the whole type scale fell through to a generic system default.",
        soWhat: "The fallback path is the one nobody tests, because it looks correct on the machine of the person who wrote it.",
      },
      {
        sprint: "Sprint 9",
        title: "A hero headline that read as pushed into the corner",
        citation: "story hero recomposition",
        what: "The first version of this very page capped its headline at 20 characters and left-aligned it, breaking the line early and stranding half the viewport at desktop widths.",
        soWhat: "Caught by the person the page was built for looking at it and saying so plainly — the fastest design review available, and the one most often skipped in favour of assuming it's fine.",
      },
    ],
  },
  {
    id: "sponsor",
    role: "Executive Sponsor",
    short: "EXEC",
    owns: "Budget, vision, go / no-go",
    produced: ["The founding brief", "The $0 constraint"],
    plain:
      "Pays for it, and decides whether it was worth it. Here: one person, no budget, and a hard rule that it must cost nothing to run.",
    mandate:
      "Set the one constraint every other role had to design around — zero infrastructure spend — and is the role most exposed when that constraint quietly turned out not to hold.",
    moments: [
      {
        sprint: "Sprint 0",
        title: "Zero infrastructure cost, stated as a founding constraint",
        citation: "PRD.md, founding brief",
        what: "The brief set a $0 infrastructure ceiling from the first sentence, before any architecture existed to satisfy it.",
        soWhat: "A constraint set before the design exists shapes every later decision. One set afterward is a target that gets negotiated away under pressure.",
      },
      {
        sprint: "Sprint 7",
        title: "The constraint got a test, not just a policy",
        citation: "test_no_paid_service_in_deploy_manifest",
        what: "A build check fails if a paid host appears in any deployment manifest — the $0 rule stopped being an intention and became something the pipeline enforces.",
        soWhat: "An intention drifts quietly. A test either passes or it doesn't.",
      },
      {
        sprint: "Sprint 8",
        title: "The constraint held, but only after it had already been broken once",
        citation: "D-017",
        what: "The chosen runtime host moved behind a paid plan. The $0 rule was preserved by migrating the runtime rather than by quietly accepting the cost — but the gap existed for three sprints before anyone checked.",
        soWhat: "A constraint enforced by a test still depends on someone verifying the thing the test can't see — in this case, that the platform itself hadn't changed the rules underneath it.",
      },
    ],
  },
];
