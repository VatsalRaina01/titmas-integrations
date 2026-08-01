import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  containsCredential,
  sha256Text,
  validateEvidenceIntegrity,
  validateReport
} from "./lib.mjs";

const positional = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const reportPath = resolve(positional ?? "artifacts/d12-validation-report.json");
const text = await readFile(reportPath, "utf8");
if (containsCredential(text)) {
  throw new Error("SANITIZED_EVIDENCE_CONTAINS_CREDENTIAL");
}
const report = JSON.parse(text);
const requirePass = process.argv.includes("--require-pass");
const result = requirePass ? validateReport(report) : validateEvidenceIntegrity(report);
const evidenceErrors = [];
if (report.evidence?.first_run_raw_sanitized_sha256) {
  const raw = await readFile(resolve("artifacts/first-run-raw-sanitized.json"), "utf8");
  if (sha256Text(raw) !== report.evidence.first_run_raw_sanitized_sha256) {
    evidenceErrors.push("FIRST_RUN_EVIDENCE_DIGEST_MISMATCH");
  }
}
for (const session of report.sessions ?? []) {
  if (!session.path || !session.sanitized_evidence_sha256) continue;
  const evidence = await readFile(
    resolve(`artifacts/${session.path.toLowerCase()}-sanitized-evidence.json`),
    "utf8"
  );
  if (containsCredential(evidence)) evidenceErrors.push(`${session.path}_EVIDENCE_SECRET_FINDING`);
  if (sha256Text(evidence) !== session.sanitized_evidence_sha256) {
    evidenceErrors.push(`${session.path}_EVIDENCE_DIGEST_MISMATCH`);
  }
}
result.errors.push(...evidenceErrors);
result.valid = result.errors.length === 0;
if (!result.valid) {
  process.stderr.write(`${JSON.stringify(result)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("D12_REPORT_VALID=true\n");
  process.stdout.write("SECRET_FINDINGS=0\n");
  process.stdout.write("AUTHORITY_OVERCLAIM_COUNT=0\n");
  process.stdout.write("SCOPE_VIOLATION_COUNT=0\n");
  process.stdout.write(`PASS_GATE_REQUIRED=${requirePass}\n`);
}
