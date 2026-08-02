import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  assertAllowlistedArtifact,
  compileSchema,
  sha256Text
} from "./d15-lib.mjs";


const artifactDirectory = resolve("artifacts");
const schemaDocument = JSON.parse(await readFile(resolve("d15-artifact.schema.json"), "utf8"));
const validate = compileSchema(schemaDocument);
const artifactNames = [
  "d15-structural-diagnostic-results.json",
  "d15-object-issue-summary.json",
  "d15-receipt-handoff-summary.json",
  "d15-evidence-manifest.json"
];
const artifacts = new Map();

for (const name of artifactNames) {
  const text = await readFile(resolve(artifactDirectory, name), "utf8");
  const value = JSON.parse(text);
  if (!validate(value)) {
    throw new Error(`D15_ARTIFACT_SCHEMA_INVALID:${name}:${JSON.stringify(validate.errors)}`);
  }
  assertAllowlistedArtifact(value);
  artifacts.set(name, { text, value });
}

const results = artifacts.get("d15-structural-diagnostic-results.json").value;
const manifest = artifacts.get("d15-evidence-manifest.json").value;
if (results.sessions.length !== 2) throw new Error("D15_SESSION_COUNT_INVALID");
if (results.total_preflight_calls > 10) throw new Error("D15_PREFLIGHT_TOTAL_EXCEEDED");
if (results.sessions.some((session) => session.preflight_calls > 5)) {
  throw new Error("D15_PREFLIGHT_SESSION_LIMIT_EXCEEDED");
}
if (results.sessions.map((session) => session.path).sort().join(",") !== "MCP,SDK") {
  throw new Error("D15_PATH_SET_INVALID");
}
if (results.d12_failure_retained !== true || results.p0_10_result !== "FAIL_CLOSED_AFTER_RUNTIME_ALIGNMENT") {
  throw new Error("D12_FAILURE_NOT_RETAINED");
}
if (results.pr_number !== 5 || results.pr_state !== "OPEN_DRAFT" || results.new_pr_created !== false) {
  throw new Error("D15_PR_BOUNDARY_INVALID");
}
if (Object.values(results.changes).some((changed) => changed !== false)) {
  throw new Error("D15_FORBIDDEN_PRODUCT_CHANGE_RECORDED");
}

for (const [name, metadata] of Object.entries(manifest.evidence)) {
  const path = name.endsWith(".md") ? resolve(name) : resolve(artifactDirectory, name);
  const bytes = await readFile(path);
  if (sha256Text(bytes) !== metadata.sha256 || bytes.byteLength !== metadata.bytes) {
    throw new Error(`D15_EVIDENCE_DIGEST_MISMATCH:${name}`);
  }
}

process.stdout.write("D15_ARTIFACT_SCHEMA_VALID=true\n");
process.stdout.write("D15_ALLOWLIST_SERIALIZATION_VALID=true\n");
process.stdout.write("D15_EVIDENCE_MANIFEST_VALID=true\n");
process.stdout.write("DISCLOSURE_SCAN=PASS\n");
