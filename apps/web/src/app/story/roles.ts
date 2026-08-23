/**
 * The role threads behind /story's perspective chooser.
 *
 * Every `moment` here cites a real artefact in this repository — a defect ID, an
 * ADR, a sprint review. That constraint is the point: a role-perspective feature
 * is trivially fakeable, and a page of plausible-sounding invented opinions is
 * exactly the thing this project spent eighteen defects learning not to ship.
 * If a role has no real moment, it does not get a fabricated one.
 *
 * `plain` is written for a reader with no engineering background. It is not a
 * simplified alternative to the technical text — it is the lede, and the detail
 * sits underneath it. Nobody is routed to a lesser version of the page.
 */

export type RoleThread = {
  id: string;
  role: string;
  short: string;
  owns: string;
  produced: string[];
  /** One-line answer to "what does this person actually do", for a non-expert. */
  plain: string;
  moment: {
    title: string;
    citation: string;
    what: string;
    /** Why this mattered — the transferable lesson, not the incident. */
    soWhat: string;
  };
};

export const ROLES: RoleThread[] = [
  {
    id: "ba",
    role: "Business Analyst",
    short: "BA",
    owns: "Requirements, acceptance criteria, traceability",
    produced: ["BRD", "User stories", "Traceability matrix"],
    plain:
      "Decides what 'done' means before anyone builds, and keeps a list proving every promise was kept — or admitting it wasn't.",
    moment: {
      title: "Only 13 of 58 requirements are marked done, and the matrix says so",
      citation: "TRACEABILITY.md",
      what:
        "Every requirement names the test that proves it. A build check fails if any row claims Done while the test it names cannot be found in the repository.",
      soWhat:
        "The honest number is the useful one. A matrix that rounds up is a matrix nobody can use to decide what to work on next.",
    },
  },
  {
    id: "pm",
    role: "Product Manager",
    short: "PM",
    owns: "Vision, scope, prioritisation, success metrics",
    produced: ["PRD", "Roadmap", "Release notes"],
    plain:
      "Decides what the product is for and — harder — what it deliberately will not do.",
    moment: {
      title: "One workload, chosen on purpose",
      citation: "PRD.md §1",
      what:
        "The product demonstrates a single flagship workload — production incident triage — rather than a shallow spread of features.",
      soWhat:
        "Depth in one workload proves the engineering. Breadth across five would have proved only that five stubs can be written.",
    },
  },
  {
    id: "tpm",
    role: "Technical Program Manager",
    short: "TPM",
    owns: "Charter, sprint plans, risks, dependencies",
    produced: ["Charter", "Sprint plans", "Risk register"],
    plain:
      "Keeps the plan honest — what was committed, what actually shipped, and what is blocked on someone else.",
    moment: {
      title: "Two sprints were worked and shipped without ever being opened",
      citation: "D-016",
      what:
        "Sprints 6 and 7 had no planning ceremony and no plan document. The sprint numbers existed only inside defect-log entries.",
      soWhat:
        "A previous retrospective had already committed, in writing, to catching exactly this. It relied on someone remembering, so it failed. It is a build check now.",
    },
  },
  {
    id: "sm",
    role: "Scrum Master",
    short: "SM",
    owns: "Ceremonies, impediments, velocity",
    produced: ["Sprint reviews", "Retrospectives"],
    plain:
      "Watches the process itself rather than the product — and calls it out when the team quietly stops following its own rules.",
    moment: {
      title: "A commitment made in a retrospective, then not honoured",
      citation: "SPRINT_05_REVIEW.md",
      what:
        "The Sprint 5 retrospective committed to raising a silent role as an impediment. Two sprints later that is precisely what happened, unnoticed.",
      soWhat:
        "A retrospective action nobody checks at the next retrospective is not an action. It is a wish with a due date.",
    },
  },
  {
    id: "architect",
    role: "Solutions Architect / FDE",
    short: "ARCH",
    owns: "System design, integration, deployment topology",
    produced: ["12 ADRs", "Tech spec", "Architecture diagrams"],
    plain:
      "Decides how the pieces fit together, and writes down why — including what each choice gave up.",
    moment: {
      title: "A hosting decision recorded without ever checking the price",
      citation: "ADR-0003 → ADR-0012",
      what:
        "The runtime was placed on a platform 'because it is free'. That claim was never read off the pricing page. It later moved behind a paid plan, invalidating three sprints of deployment work.",
      soWhat:
        "The rule that came out of it: a decision record depending on a third party's pricing must name the page it was read from, and the date.",
    },
  },
  {
    id: "qa",
    role: "QA Lead",
    short: "QA",
    owns: "Test strategy, Definition of Done, defect triage",
    produced: ["Test plan", "Defect log", "18 logged defects"],
    plain:
      "Refuses to accept 'it works' without evidence — and is suspicious of evidence that is too convenient.",
    moment: {
      title: "A test suite that reported 0% errors when the real rate was 56.6%",
      citation: "D-001",
      what:
        "The refusal gate was measured on 22 questions written by the person who built it. On a larger, harder set it got 150 of 265 wrong.",
      soWhat:
        "The most dangerous test result is a good one from a sample you chose yourself. Three later defects were checks that could not fail at all.",
    },
  },
  {
    id: "devops",
    role: "DevOps / SRE",
    short: "SRE",
    owns: "CI/CD, environments, observability, incident response",
    produced: ["Pipelines", "Dockerfile", "Deployment"],
    plain:
      "Makes sure it runs somewhere other than the laptop it was written on, and keeps running when something breaks.",
    moment: {
      title: "The pipeline never built the web application at all",
      citation: "D-018",
      what:
        "A dependency upgrade reported ten green checks while its production build failed on every page. No job had ever run the build.",
      soWhat:
        "A green tick that exercises none of the code under change is worse than no tick, because it gets read as evidence.",
    },
  },
  {
    id: "appsec",
    role: "Application Security Engineer",
    short: "SEC",
    owns: "Threat model, scanning, supply chain, penetration testing",
    produced: ["Threat model", "Security pipeline", "SBOM"],
    plain:
      "Assumes someone hostile will find this and asks what they could do with it.",
    moment: {
      title: "A rate-limit test that passed while the service was down",
      citation: "D-013",
      what:
        "The check sent 8 requests against a limit of 20, and treated any error as proof the limit worked — so a dead service reported as correctly protected.",
      soWhat:
        "Security controls are now verified by pointing them at something known to be broken and confirming they fail.",
    },
  },
  {
    id: "designer",
    role: "UX / UI Designer",
    short: "UX",
    owns: "Design system, layout, motion, accessibility",
    produced: ["Design tokens", "Motion spec", "Three typographic voices"],
    plain:
      "Decides how it looks and, more importantly, whether a stranger can understand it without being told.",
    moment: {
      title: "The site shipped for three sprints with no webfont",
      citation: "SPRINT_09_PLAN.md",
      what:
        "The type stack named fonts that exist only on Apple hardware. On Windows — most readers — the entire type scale fell through to a generic system default.",
      soWhat:
        "The fallback path is the one nobody tests, because it looks correct on the machine of the person who wrote it.",
    },
  },
  {
    id: "sponsor",
    role: "Executive Sponsor",
    short: "EXEC",
    owns: "Budget, vision, go / no-go",
    produced: ["The founding brief", "The $0 constraint"],
    plain:
      "Pays for it, and decides whether it was worth it. Here: one person, no budget, and a hard rule that it must cost nothing to run.",
    moment: {
      title: "Zero infrastructure cost, enforced by a test",
      citation: "test_no_paid_service_in_deploy_manifest",
      what:
        "Every hosted dependency runs on a free tier. A build check fails if a paid host appears in a deployment manifest.",
      soWhat:
        "A constraint with a test behind it is a constraint. Without one it is an intention, and intentions drift quietly.",
    },
  },
];
