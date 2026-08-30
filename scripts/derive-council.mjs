/**
 * Derive the governance record for the public /council surface (FR-032).
 *
 * The project is run under a named-role charter, and until now that was a claim
 * on the story page with a document behind it. This turns it into something a
 * reader can inspect: which roles exist, what each one owns, which real
 * artefacts they reviewed, what each said, and where they disagreed.
 *
 * Parsed from the two documents that already hold it — WAYS_OF_WORKING.md for
 * the roster and COUNCIL_RETROSPECTIVE.md for the review — rather than retyped.
 * A hand-maintained copy of a governance document is a second source of truth
 * for the thing the project most needs one source of, and this repo has already
 * been bitten by exactly that (D-014, D-019, D-020).
 *
 *   node scripts/derive-council.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(resolve(root, relative), "utf8");
const out = resolve(root, "apps/web/src/generated/council.json");

/** The delivery roster, from the charter's own role table. */
function roles() {
  const charter = read("docs/00-governance/WAYS_OF_WORKING.md");
  const section = charter.split("## 2. The delivery team")[1]?.split("\n## ")[0] ?? "";
  return section
    .split("\n")
    .filter((line) => /^\|\s*\*\*/.test(line))
    .map((line) => {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      return {
        role: (cells[0] ?? "").replace(/\*\*/g, ""),
        owns: cells[1] ?? "",
        produces: cells[2] ?? "",
      };
    });
}

/** The stakeholder roles the human occupies, and what authority each carries. */
function stakeholders() {
  const charter = read("docs/00-governance/WAYS_OF_WORKING.md");
  const section = charter.split("## 3. Your roles")[1]?.split("\n### ")[0] ?? "";
  return section
    .split("\n")
    .filter((line) => /^\|\s*\*\*/.test(line))
    .map((line) => {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      return {
        role: (cells[0] ?? "").replace(/\*\*/g, ""),
        when: cells[1] ?? "",
        authority: cells[2] ?? "",
      };
    });
}

/**
 * The review itself: each artefact, every role's reaction to it, and the
 * divergence line.
 *
 * Reactions are bullets of the form `- **Role:** text`, and the divergence is
 * the bullet whose label is "Where they diverged". Splitting on that label
 * rather than on position means a section that omits it parses correctly
 * instead of silently promoting the last reaction into the divergence slot.
 */
function artifacts() {
  const retro = read("docs/00-governance/COUNCIL_RETROSPECTIVE.md");
  const sections = retro.split(/^## /m).slice(1);

  return sections
    .map((section) => {
      const [headingLine, ...rest] = section.split("\n");
      const body = rest.join("\n");
      const heading = headingLine.trim();

      // "3. The console displayed ... — [D-009](DEFECT_LOG.md)"
      const numbered = heading.match(/^(\d+)\.\s*(.*)$/);
      if (!numbered) return null;

      const title = numbered[2].replace(/\s*—\s*\[.*$/, "").trim();
      const citations = [...heading.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((m) => ({
        label: m[1],
        href: m[2],
      }));

      const happened = body.match(/\*\*What happened:\*\*\s*([\s\S]*?)(?=\n\s*\n|\n- )/);

      const reactions = [];
      let diverged = "";
      for (const bullet of body.matchAll(/^- \*\*([^:*]+):?\*\*:?\s*([\s\S]*?)(?=\n- \*\*|\n---|\n*$)/gm)) {
        const label = bullet[1].trim();
        const text = bullet[2].replace(/\s+/g, " ").trim();
        if (/^where they diverged$/i.test(label)) diverged = text;
        else reactions.push({ role: label, text });
      }

      return {
        number: Number.parseInt(numbered[1], 10),
        title,
        citations,
        what: (happened?.[1] ?? "").replace(/\s+/g, " ").trim(),
        reactions,
        diverged,
      };
    })
    .filter((entry) => entry && entry.reactions.length > 0);
}

const council = { roles: roles(), stakeholders: stakeholders(), artifacts: artifacts() };

// Fail loudly rather than emitting an empty surface. A page that renders zero
// roles under the heading "how this project is governed" is worse than no page:
// it reads as a claim that there is no governance.
for (const [key, value] of Object.entries(council)) {
  if (!Array.isArray(value) || value.length === 0) {
    console.error(`derive-council: parsed no ${key}; the source document has moved`);
    process.exit(1);
  }
}

writeFileSync(out, JSON.stringify(council, null, 2) + "\n");
const reactions = council.artifacts.reduce((n, a) => n + a.reactions.length, 0);
console.log(
  `derived council.json (${council.roles.length} delivery roles, ` +
    `${council.stakeholders.length} stakeholder roles, ${council.artifacts.length} artefacts, ` +
    `${reactions} role reactions)`,
);
