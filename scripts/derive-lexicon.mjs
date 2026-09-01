/**
 * The lexicon: every identifier this project uses, what it means, and every
 * place it appears — derived, never typed.
 *
 * SandScope is full of references that a reader cannot follow. "D-016",
 * "ADR-0013", "FR-020", "S6-HERO", "T-15" appear 1,449 times across the
 * documents and the code, and each one is a dead end unless you already know
 * where its record lives. A reference you cannot follow is a citation the
 * reader has to take on trust, which is the opposite of what this project
 * claims to be.
 *
 * Two things are built here:
 *
 *   entities   — every identifier, its ONE-SENTENCE meaning lifted verbatim
 *                from the record that defines it, and every occurrence in
 *                date order.
 *   corpus     — the full text of the prose documents, so a reader can look
 *                up any phrase, not only the identifiers this script knows
 *                the shape of.
 *
 * The summaries are LIFTED, not written. Every one is the description column
 * of the table row that defines the identifier, or an ADR's own title. This
 * project's whole discipline is that nothing on the surface is authored twice;
 * a search feature that paraphrased its own corpus would be inventing a second
 * version of every claim, and the two would drift.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "apps/web/src/generated/lexicon.json");
const corpusOut = resolve(root, "apps/web/public/search-corpus.json");

/* ------------------------------------------------------------------ sources */

const PROSE = ["docs", "README.md"];
const CODE = ["apps/web/src", "apps/agent/sandscope_agent", "apps/agent/tests",
              "apps/agent/training", "apps/agent/scripts", "scripts", ".github/workflows"];
const TEXT_EXT = /\.(md|tsx?|py|mjs|ya?ml|html|css|sql)$/;
// `docs/superpowers/plans` holds working plans, not project records, and they
// contain deliberate FIXTURE identifiers -- FR-998 and FR-999 exist only to
// prove a guard fails on them. Indexing those would publish invented
// requirements next to real ones, which is the exact failure this project is
// built to make impossible.
const SKIP = /node_modules|\.next|__pycache__|\.venv|generated|package-lock|docs\/superpowers/;

// This file feeds deliberately-malformed records to the guards to prove they
// fail. Every identifier in it is a fixture -- FR-998 is "a thing with no test".
// Its LINES are still searchable as prose; its IDs are not identifiers.
// derive-lexicon.mjs is excluded from ITS OWN entity extraction: the comment
// above names FR-998 in order to explain that FR-998 is not real, and an
// indexer that indexes its own commentary would publish it as a requirement.
const FIXTURES = /test_guards_fail_on_bad_input\.py$|derive-lexicon\.mjs$/;

function walk(start) {
  const abs = resolve(root, start);
  let stat;
  try { stat = statSync(abs); } catch { return []; }
  if (stat.isFile()) return TEXT_EXT.test(abs) ? [abs] : [];
  return readdirSync(abs).flatMap((name) =>
    SKIP.test(join(abs, name)) ? [] : walk(join(abs, name)),
  );
}

/* -------------------------------------------------------------------- dates */

/**
 * Last-modified date per file, from one pass over the history rather than a
 * `git log` per file. A date lets the occurrences be ordered, which is the
 * whole point of showing them: the same identifier means something different
 * in the sprint that opened it and the sprint that closed it.
 */
function fileDates() {
  const log = execFileSync("git", ["log", "--format=@%aI", "--name-only"], {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  const dates = new Map();
  let current = null;
  for (const line of log.split("\n")) {
    if (line.startsWith("@")) { current = line.slice(1); continue; }
    const path = line.trim();
    if (path && current && !dates.has(path)) dates.set(path, current);
  }
  return dates;
}

/** A document's own declared date beats the file's mtime when it has one. */
function declaredDate(text) {
  const m =
    /\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/.exec(text) ??
    /\*\*Opened:\*\*\s*(\d{4}-\d{2}-\d{2})/.exec(text) ??
    /\*\*Closed:\*\*\s*(\d{4}-\d{2}-\d{2})/.exec(text);
  return m ? m[1] : null;
}

/* ----------------------------------------------------------------- entities */

/**
 * Where each identifier's meaning is DEFINED, as opposed to merely mentioned.
 * `row` reads the description out of a markdown table whose first cell is the
 * id; `adr` reads an ADR's own heading.
 */
const KINDS = [
  { kind: "defect",      label: "Defect",      re: /\bD-\d{3}\b/g,        from: "row", file: "docs/04-quality/DEFECT_LOG.md", column: 4 },
  { kind: "decision",    label: "Decision",    re: /\bADR-\d{4}\b/g,      from: "adr" },
  { kind: "requirement", label: "Requirement", re: /\b(?:FR|BR|NFR)-\d{3}\b/g, from: "row", file: "docs/01-requirements/TRACEABILITY.md", column: 1 },
  { kind: "criterion",   label: "Acceptance",  re: /\bAC-[A-Z]?\d{2,3}\b/g,   from: "row", file: null, column: 1 },
  { kind: "impediment",  label: "Impediment",  re: /\bIMP-\d{2}\b/g,          from: "row", file: null, column: 1 },
  { kind: "threat",      label: "Threat",      re: /\bT-\d{1,2}\b/g,          from: "row", file: "docs/05-security/THREAT_MODEL.md", column: 1 },
  { kind: "probe",       label: "Pen test",    re: /\bP-\d{1,2}\b/g,          from: "row", file: null, column: 1 },
  { kind: "story",       label: "Story",       re: /\bS\d+-[A-Z][A-Z0-9]+\b/g, from: "row", file: null, column: 1 },
];

/** The cells of a markdown table row, or null if the line is not one. */
function cells(line) {
  if (!line.trim().startsWith("|")) return null;
  const parts = line.split("|").slice(1, -1).map((c) => c.trim());
  return parts.length >= 2 ? parts : null;
}

/** Strip markdown emphasis, links and code fences down to readable prose. */
function plain(text) {
  return text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function main() {
  const dates = fileDates();
  const proseFiles = PROSE.flatMap(walk);
  const codeFiles = CODE.flatMap(walk);
  const files = [...new Set([...proseFiles, ...codeFiles])];

  const entities = new Map();
  const corpus = [];

  const touch = (id, kind, label) => {
    if (!entities.has(id)) {
      entities.set(id, { id, kind, label, summary: null, definedIn: null, date: null, occurrences: [] });
    }
    return entities.get(id);
  };

  for (const abs of files) {
    const rel = relative(root, abs);
    const text = readFileSync(abs, "utf8");
    const lines = text.split("\n");
    const gitDate = (dates.get(rel) ?? "").slice(0, 10);
    const docDate = declaredDate(text) ?? (gitDate === "" ? null : gitDate);
    const isProse = /\.(md|html)$/.test(rel);

    if (isProse) corpus.push({ file: rel, date: docDate, lines: lines.map((l) => l.replace(/\s+$/, "")) });

    if (FIXTURES.test(rel)) continue;

    lines.forEach((line, i) => {
      const row = cells(line);
      // Some records are headings rather than table rows: `## AC-C12 — ...`,
      // `### IMP-07 — ...`. Same contract, different shape.
      const headingDef = /^#{2,4}\s+([A-Z]{1,3}-[A-Z]?\d{1,4})\s*[—:-]\s*(.+)$/.exec(line.trim());
      for (const spec of KINDS) {
        spec.re.lastIndex = 0;
        const seen = new Set();
        let m;
        while ((m = spec.re.exec(line)) !== null) {
          const id = m[0];
          if (seen.has(id)) continue;
          seen.add(id);
          const entity = touch(id, spec.kind, spec.label);

          // A DEFINITION is a table row whose FIRST cell is this id, in the
          // file that owns the identifier (or any file, for the kinds whose
          // records are spread across sprint documents).
          const definedByHeading = headingDef !== null && headingDef[1] === id;
          const defines =
            definedByHeading ||
            (spec.from === "row" && row && plain(row[0]) === id &&
             (spec.file === null || rel === spec.file));
          if (defines && !entity.summary) {
            if (definedByHeading) {
              entity.summary = plain(headingDef[2]);
            } else {
              const col = Math.min(spec.column, row.length - 1);
              entity.summary = plain(row[col]) || plain(row[1]);
            }
            entity.definedIn = rel;
            entity.date = docDate;
          }
          entity.occurrences.push({ file: rel, line: i + 1, text: plain(line).slice(0, 320), date: docDate });
        }
      }
    });
  }

  // The pen-test results are a fixed-width block rather than a markdown table,
  // because they are pasted from the harness's own stdout. Parsed on its own
  // terms instead of being reformatted -- the point of that block is that it is
  // the tool's output, not a transcription of it.
  const pentest = resolve(root, "docs/05-security/PENTEST_RESULTS.md");
  for (const line of readFileSync(pentest, "utf8").split("\n")) {
    const m = /^(P-\d{1,2})\s+(PASS|FAIL|SKIP)\s+(T-\d{1,2})\s+(.+)$/.exec(line.trim());
    if (!m) continue;
    const entity = touch(m[1], "probe", "Pen test");
    if (!entity.summary) {
      entity.summary = `${plain(m[4])} — ${m[2].toLowerCase()}, covering ${m[3]}`;
      entity.definedIn = "docs/05-security/PENTEST_RESULTS.md";
    }
  }

  // ADRs define themselves: the filename carries the id and the H1 carries the
  // sentence. Done separately because an ADR is a document, not a table row.
  const adrDir = resolve(root, "docs/03-architecture/adr");
  for (const name of readdirSync(adrDir).filter((f) => f.endsWith(".md"))) {
    const id = `ADR-${name.slice(0, 4)}`;
    const text = readFileSync(join(adrDir, name), "utf8");
    const entity = touch(id, "decision", "Decision");
    const heading = /^#\s*(.+)$/m.exec(text);
    entity.summary = heading ? plain(heading[1]).replace(/^ADR-\d+\s*[—-]\s*/, "") : entity.summary;
    entity.definedIn = `docs/03-architecture/adr/${name}`;
    entity.date = declaredDate(text);
    entity.status = /\*\*Status:\*\*\s*\*{0,2}([^·*]+)/.exec(text)?.[1].trim() ?? null;
    entity.file = name;
  }

  const list = [...entities.values()]
    .filter((e) => e.occurrences.length > 0)
    .map((e) => ({
      ...e,
      // Newest first. A reader asking "what is D-016" wants the most recent
      // thing said about it, then the trail backwards to where it started.
      occurrences: e.occurrences.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
      count: e.occurrences.length,
    }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const undefined_ = list.filter((e) => !e.summary).length;

  writeFileSync(out, JSON.stringify({
    generatedAt: new Date().toISOString(),
    sha: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    kinds: KINDS.map((k) => ({ kind: k.kind, label: k.label })),
    entities: list,
  }, null, 2) + "\n");

  writeFileSync(corpusOut, JSON.stringify({ generatedAt: new Date().toISOString(), documents: corpus }) + "\n");

  const bytes = statSync(corpusOut).size;
  process.stdout.write(
    `derived lexicon: ${list.length} identifiers, ` +
    `${list.reduce((n, e) => n + e.count, 0)} occurrences, ` +
    `${list.length - undefined_} with a definition\n` +
    `derived corpus: ${corpus.length} documents, ${(bytes / 1024).toFixed(0)}KB\n`,
  );
}

main();
