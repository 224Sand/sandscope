/**
 * Quality gate: product.config.json must satisfy schemas/product.config.schema.json.
 *
 * Deliberately dependency-free. The schema uses only required/type/minLength/
 * maxLength/pattern, so a full JSON Schema engine would be 400KB of node_modules
 * to validate one 12-key file. If the schema ever needs $ref, allOf or oneOf,
 * replace this with ajv and say so in an ADR.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// An optional root lets the guard be pointed at a fixture and observed to
// FAIL, which is Definition of Done item 9. A guard that has only ever been
// run against a passing tree has not been tested.
const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(process.argv[2] ?? here);
const errors = [];

// The config under test comes from `root`. The schema is the guard's own
// contract rather than fixture data, so a fixture that supplies only a
// product.config.json still validates: prefer a schema under `root` when the
// tree being checked ships one, otherwise fall back to the one beside this
// script.
const rootSchema = resolve(root, "schemas/product.config.schema.json");
const schemaPath = existsSync(rootSchema)
  ? rootSchema
  : resolve(here, "schemas/product.config.schema.json");

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const config = JSON.parse(readFileSync(resolve(root, "product.config.json"), "utf8"));

for (const key of schema.required ?? []) {
  if (!(key in config)) errors.push(`missing required key: ${key}`);
}

for (const [key, rule] of Object.entries(schema.properties ?? {})) {
  if (!(key in config)) continue;
  const value = config[key];

  if (rule.type === "string" && typeof value !== "string") {
    errors.push(`${key}: expected string, got ${typeof value}`);
    continue;
  }
  if (rule.type === "boolean" && typeof value !== "boolean") {
    errors.push(`${key}: expected boolean, got ${typeof value}`);
    continue;
  }
  if (typeof value === "string") {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      errors.push(`${key}: length ${value.length} < minLength ${rule.minLength}`);
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      errors.push(`${key}: length ${value.length} > maxLength ${rule.maxLength}`);
    }
    if (rule.pattern !== undefined && !new RegExp(rule.pattern).test(value)) {
      errors.push(`${key}: "${value}" does not match /${rule.pattern}/`);
    }
  }
}

// FR-001 invariant: the name is authored in exactly one place. slug must be the
// lowercase, hyphenated form of name, or a rename would silently desynchronise them.
const expectedSlug = String(config.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
if (config.slug !== expectedSlug) {
  errors.push(`slug "${config.slug}" is not derived from name "${config.name}" (expected "${expectedSlug}")`);
}

if (errors.length) {
  console.error("✗ product.config.json failed validation:");
  for (const e of errors) console.error(`   · ${e}`);
  process.exit(1);
}
console.log(`✓ product.config.json valid — "${config.name}"${config.provisional ? " (provisional)" : ""}`);
