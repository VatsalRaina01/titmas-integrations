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
if (report.post_d13_rerun?.summary_report) {
  const summaryText = await readFile(
    resolve("artifacts", report.post_d13_rerun.summary_report),
    "utf8"
  );
  if (containsCredential(summaryText)) {
    evidenceErrors.push("POST_D13_SUMMARY_SECRET_FINDING");
  }
  const summary = JSON.parse(summaryText);
  const postD13Artifacts = {
    raw_sanitized_sha256: "post-d13-run-raw-sanitized.json",
    mcp_sanitized_sha256: "post-d13-mcp-sanitized-evidence.json",
    sdk_sanitized_sha256: "post-d13-sdk-sanitized-evidence.json"
  };
  for (const [digestKey, filename] of Object.entries(postD13Artifacts)) {
    const artifact = await readFile(resolve("artifacts", filename), "utf8");
    if (containsCredential(artifact)) {
      evidenceErrors.push(`POST_D13_${digestKey.toUpperCase()}_SECRET_FINDING`);
    }
    if (sha256Text(artifact) !== summary.evidence?.[digestKey]) {
      evidenceErrors.push(`POST_D13_${digestKey.toUpperCase()}_DIGEST_MISMATCH`);
    }
  }
  if (
    summary.p0_10_result !== report.p0_10_result ||
    summary.active_credential_count_after_closure !== 0 ||
    summary.success_gate_met !== false
  ) {
    evidenceErrors.push("POST_D13_SUMMARY_STATUS_MISMATCH");
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
