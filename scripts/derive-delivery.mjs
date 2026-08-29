/**
 * Derive the delivery record from the repository (AC-C12, FR-020..FR-024).
 *
 * Every number on /delivery comes from here. Not one is typed by a human,
 * because a hand-written test count is a claim that drifts the moment someone
 * adds a test and forgets, and the whole argument of that page is that its
 * numbers can be checked.
 *
 *   node scripts/derive-delivery.mjs
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "apps/web/src/generated/delivery.json");

const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const read = (relative) => readFileSync(resolve(root, relative), "utf8");

function countTests() {
  /** Counted by parsing test files rather than by running pytest: this script
   *  runs at build time on a machine that may have no Python environment, and a
   *  number that only exists when the suite runs is a number the page cannot
   *  show. CI asserts the suite passes; this asserts how many there are. */
  const dir = resolve(root, "apps/agent/tests");
  let total = 0;
  let files = 0;
  for (const name of readdirSync(dir)) {
    if (!name.startsWith("test_") || !name.endsWith(".py")) continue;
    files += 1;
    total += (read(`apps/agent/tests/${name}`).match(/^\s*def test_/gm) ?? []).length;
  }
  return { total, files };
}

function countLines(globs) {
  let total = 0;
  for (const path of globs) {
    try {
      const output = execFileSync(
        "bash",
        ["-c", `find ${path} -type f \\( -name '*.py' -o -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' -o -name '*.sql' \\) ! -path '*/.venv*' ! -path '*/node_modules/*' ! -path '*/.next/*' ! -path '*/reranker/*' -print0 | xargs -0 cat | grep -cve '^\\s*$'`],
        { cwd: root, encoding: "utf8" },
      );
      total += Number.parseInt(output.trim(), 10) || 0;
    } catch {
      /* a path that does not exist contributes nothing */
    }
  }
  return total;
}

function requirements() {
  /** FR-021 renders the matrix PUBLICLY, which until now meant three
   *  aggregate numbers — total, done, planned. Three numbers are a summary of
   *  a traceability matrix, not the matrix; a reader could see that 46 of 58
   *  are done and had no way to ask WHICH, or what test any one of them
   *  rests on. The per-row detail is emitted here so the page can render the
   *  actual table, which is the only version of "rendered publicly" that
   *  lets a reviewer check the claim rather than accept it. */
  const matrix = read("docs/01-requirements/TRACEABILITY.md");
  const rows = matrix
    .split("\n")
    .filter((line) => /^\|\s*[A-Z]{2,4}-\d{3}\s*\|/.test(line))
    .map((line) => line.split("|").map((cell) => cell.trim()).filter(Boolean));
  return {
    total: rows.length,
    done: rows.filter((r) => (r[5] ?? "").toLowerCase().startsWith("done")).length,
    planned: rows.filter((r) => (r[5] ?? "").toLowerCase().startsWith("planned")).length,
    rows: rows.map((r) => ({
      id: r[0] ?? "",
      requirement: r[1] ?? "",
      story: r[2] ?? "",
      // The matrix wraps test names in backticks for markdown; the page does
      // its own monospacing, so they are stripped here rather than rendered
      // as literal punctuation.
      test: (r[3] ?? "").replace(/`/g, ""),
      sprint: r[4] ?? "",
      status: r[5] ?? "",
    })),
  };
}

function defects() {
  const log = read("docs/04-quality/DEFECT_LOG.md");
  const rows = log.split("\n").filter((line) => /^\|\s*D-\d{3}\s*\|/.test(line));
  return {
    total: rows.length,
    severityOne: rows.filter((line) => line.includes("**1**")).length,
    entries: rows.map((line) => {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      return {
        id: cells[0], found: cells[1], sprint: cells[2],
        severity: (cells[3] ?? "").replace(/\*/g, ""),
        description: cells[4], cause: cells[5], status: cells[6],
      };
    }),
  };
}

/** The body of the first matching `## Heading` section of an ADR, markdown
 *  emphasis removed.
 *
 *  Takes a LIST of acceptable headings because the house format is not quite
 *  as fixed as it looks: most ADRs use `## Consequences`, but ADR-0012 splits
 *  the same content across `## What this costs` and `## What survives`. The
 *  first version of this parser looked only for `Consequences` and returned
 *  an empty string for that one file — which the page would have rendered as
 *  a blank panel, silently implying the decision had no consequences rather
 *  than that the parser could not find them. Falling back through real
 *  alternatives is the fix; a `Consequences` section that genuinely does not
 *  exist is caught by check-delivery-content.mjs rather than shown as blank. */
function adrSection(body, headings) {
  // Split on the headings themselves rather than matching a section with a
  // lookahead. The lookahead version was `(?=\n## |$)` with the `m` flag —
  // and under `m`, `$` matches the end of every LINE, so the non-greedy body
  // stopped at the first newline. Every section rendered as its own opening
  // sentence, about 75 characters, cut mid-clause. It looked plausible enough
  // in a truncated console dump and was only obvious in the browser.
  const sections = new Map();
  let current = null;
  const lines = [];
  for (const line of body.split("\n")) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      if (current) sections.set(current, lines.splice(0).join("\n"));
      current = heading[1];
      lines.length = 0;
    } else if (current) {
      lines.push(line);
    }
  }
  if (current) sections.set(current, lines.join("\n"));

  for (const heading of headings) {
    const raw = sections.get(heading);
    if (!raw) continue;
    const text = raw
      .replace(/\*\*/g, "")
      .split("\n")
      // A markdown horizontal rule is a document separator, not prose. Left
      // in, it arrived at the end of the rendered paragraph as a literal
      // "---" — which is also how a truncated section looks, so the e2e
      // guard flagged it before a reader had to.
      .filter((line) => !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line))
      .map((line) => line.trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) return text;
  }
  return "";
}

function adrs() {
  /** FR-023 asks for decision records rendered "with context and
   *  consequences". The page rendered a title, a status, and a link to
   *  GitHub — which is a bibliography, not a decision record. The point of an
   *  ADR is the reasoning and what it cost; a reader who has to leave the
   *  site to find either is being shown that the ADRs exist, not what they
   *  say. Both sections are derived here so the page can render them. */
  const dir = resolve(root, "docs/03-architecture/adr");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      const body = read(`docs/03-architecture/adr/${name}`);
      const title = body.match(/^#\s*(.+)$/m)?.[1] ?? name;
      const status = body.match(/\*\*Status:\*\*\s*([A-Za-z]+)/)?.[1] ?? "unknown";
      const date = body.match(/\*\*Status:\*\*[^\n]*?Date:\*\*\s*([\d-]+)/)?.[1] ?? "";
      return {
        file: name,
        title,
        status,
        date,
        context: adrSection(body, ["Context"]),
        decision: adrSection(body, ["Decision"]),
        consequences: adrSection(body, [
          "Consequences",
          "What this costs",
          "Consequence for the requirement",
        ]),
      };
    });
}

/** The commit date the given path was first added to the repository, or null
 *  if git has no record of it (a shallow clone, or the file genuinely never
 *  existed on this branch). `--follow` survives a rename. */
function firstAddedISO(relativePath) {
  try {
    const lines = git("log", "--diff-filter=A", "--follow", "--format=%aI", "--", relativePath)
      .split("\n")
      .filter(Boolean);
    return lines.length ? lines[lines.length - 1] : null;
  } catch {
    return null;
  }
}

/** Commits with a commit date in [startISO, endISO). `endISO` of null means
 *  "still open" and counts up to HEAD. */
function commitsBetween(startISO, endISO) {
  if (!startISO) return null;
  const args = ["rev-list", "--count", `--since=${startISO}`];
  if (endISO) args.push(`--until=${endISO}`);
  args.push("HEAD");
  try {
    return Number.parseInt(git(...args), 10);
  } catch {
    return null;
  }
}

function sprints() {
  /** D-020 / FR-022: this used to read `**Velocity: 40/40**` out of the
   *  review document with a regex -- a number typed by whoever wrote the
   *  review, asserting its own correctness. `ACCEPTANCE_CRITERIA_CONSOLE.md`
   *  explicitly names that pattern as a rejected example ("a sprint velocity
   *  that is not computed from commits"), and the codebase violated its own
   *  written acceptance criterion until this was noticed by the same audit
   *  that produced D-020.
   *
   *  Velocity is now literally that: real commits with a commit date inside
   *  the sprint's window. The window's boundaries are themselves derived from
   *  git, not typed -- the date each SPRINT_N_PLAN.md was first added to the
   *  repository, through the date the NEXT sprint's plan was added (or HEAD,
   *  for whichever sprint is currently open). Nothing about a sprint's pace
   *  is hand-entered anymore; if that number is wrong, it is wrong because
   *  the commit history is, which is the only kind of wrong this page can
   *  meaningfully claim to have eliminated. */
  const dir = resolve(root, "docs/00-governance");
  const planFiles = readdirSync(dir).filter((name) => /^SPRINT_\d+_PLAN\.md$/.test(name));
  const planStart = new Map();
  for (const name of planFiles) {
    const number = Number.parseInt(name.match(/\d+/)?.[0] ?? "0", 10);
    planStart.set(number, firstAddedISO(`docs/00-governance/${name}`));
  }
  return readdirSync(dir)
    .filter((name) => /^SPRINT_\d+_REVIEW\.md$/.test(name))
    .sort()
    .map((name) => {
      const body = read(`docs/00-governance/${name}`);
      const number = Number.parseInt(name.match(/\d+/)?.[0] ?? "0", 10);
      const commits = commitsBetween(planStart.get(number), planStart.get(number + 1) ?? null);
      return {
        number,
        name: body.match(/^\*\*Sprint:\*\*\s*\d+\s*—\s*(.+?)\s*·/m)?.[1] ?? "",
        release: body.match(/\*\*Release:\*\*\s*([\d.]+)/)?.[1] ?? "",
        velocity:
          commits === null
            ? "unavailable (no commit history)"
            : `${commits} commit${commits === 1 ? "" : "s"}`,
      };
    });
}

const commits = git("rev-list", "--count", "HEAD");
const lastCommit = git("log", "-1", "--format=%aI");

// `git log --reverse --max-count=1` does NOT give the first commit: the limit
// is applied before the reversal, so it returns the newest commit and reverses
// a list of one. It reported firstCommit === lastCommit, which made the project
// look like it happened in a single instant. Ask for the root commit instead.
//
// A build host may hand this script a SHALLOW clone -- CI's default checkout
// was depth-1 until that was fixed here, and a hosting platform's git
// checkout is not guaranteed full history either. `--max-parents=0` does NOT
// throw on a shallow clone to signal that: git treats the shallow boundary
// commit as parentless from the local repo's point of view and hands it back
// with exit 0, so a try/catch around it never engages. Verified against a
// REAL shallow clone (`git clone --depth 1`), not assumed -- it returned the
// current HEAD as "the root commit", exactly the firstCommit===lastCommit
// bug this block exists to fix, reached by a path that looks like success.
// The only reliable signal is asking git directly whether the clone is
// shallow, so that is checked explicitly rather than inferred.
let firstCommit;
const isShallow = git("rev-parse", "--is-shallow-repository") === "true";
if (isShallow) {
  console.warn(
    "derive-delivery: shallow clone -- the true first commit is not in this " +
      "checkout. Using the oldest commit available instead (may equal the " +
      "latest commit, and the `commits` total below is a lower bound too).",
  );
  // `-1 --reverse` has the exact limit-before-reverse bug documented above.
  // List everything this checkout has, oldest last, and take that.
  const all = git("log", "--format=%aI").split("\n").filter(Boolean);
  firstCommit = all[all.length - 1];
} else {
  const root = git("rev-list", "--max-parents=0", "HEAD").split("\n")[0];
  firstCommit = git("log", "-1", "--format=%aI", root);
}
const sha = git("rev-parse", "--short", "HEAD");

const record = {
  generatedAt: new Date().toISOString(),
  repo: JSON.parse(read("product.config.json")).repo,
  sha,
  commits: Number.parseInt(commits, 10),
  firstCommit,
  lastCommit,
  tests: countTests(),
  lines: {
    agent: countLines(["apps/agent/sandscope_agent", "apps/agent/migrations"]),
    tests: countLines(["apps/agent/tests"]),
    web: countLines(["apps/web/src"]),
    tooling: countLines(["scripts", "apps/agent/training", "apps/agent/scripts"]),
  },
  docs: {
    files: execFileSync("bash", ["-c", "find docs -name '*.md' | wc -l"], { cwd: root, encoding: "utf8" }).trim(),
    lines: Number.parseInt(
      execFileSync("bash", ["-c", "find docs -name '*.md' -exec cat {} + | grep -cve '^\\s*$'"], { cwd: root, encoding: "utf8" }).trim(),
      10,
    ),
  },
  requirements: requirements(),
  defects: defects(),
  adrs: adrs(),
  sprints: sprints(),
};

writeFileSync(out, JSON.stringify(record, null, 2) + "\n");

// Mirror the product config INTO the app's own source tree.
//
// Every page previously imported ../../../../../product.config.json -- six
// levels up, outside apps/web. Webpack allowed that; Turbopack, which Next 16
// uses for production builds, refuses any import that escapes the project root,
// and the build fails on all seven files at once.
//
// Copying it at derive time keeps product.config.json as the single source of
// truth while giving the app a path it is allowed to resolve.
writeFileSync(
  resolve(root, "apps/web/src/generated/product.config.json"),
  read("product.config.json"),
);
process.stdout.write(
  `derived ${record.commits} commits · ${record.tests.total} tests · ` +
  `${record.requirements.total} requirements · ${record.defects.total} defects · ` +
  `${record.adrs.length} ADRs · ${record.sprints.length} sprint reviews\n`,
);
