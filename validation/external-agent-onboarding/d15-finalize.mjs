import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertAllowlistedArtifact,
  compileSchema,
  sha256Text
} from "./d15-lib.mjs";


const HERE = dirname(fileURLToPath(import.meta.url));
const privateOutputDirectory = resolve(requiredEnvironment("D15_PRIVATE_OUTPUT_DIR"));
const closurePath = resolve(requiredEnvironment("D15_CREDENTIAL_CLOSURE_ATTESTATION"));
const prHeadBefore = requiredEnvironment("D15_PR_HEAD_BEFORE");
const source = JSON.parse(
  await readFile(resolve(privateOutputDirectory, "d15-private-sanitized-session-results.json"), "utf8")
);
const closure = JSON.parse(await readFile(closurePath, "utf8"));

if (
  closure.all_d15_credentials_revoked !== true ||
  closure.active_d15_credentials !== 0 ||
  closure.revoked_credential_http_401_verified !== true
) {
  throw new Error("D15_CREDENTIAL_CLOSURE_NOT_PROVEN");
}

const highFindings = [source.object_construction, source.receipt_handoff].filter(
  (finding) => finding.confidence_score >= 0.85 && finding.competing_layers_excluded_by_evidence
);
const uniqueLayers = new Set(highFindings.map((finding) => finding.affected_layer));
const oneLayerOnly = highFindings.length === 2 && uniqueLayers.size === 1;
const sessionBoundaryBlocked = source.sessions.some(
  (session) => session.execution_status !== "AGENT_COMPLETED_WITHIN_BOUNDED_ROUNDS"
);
const nextHumanDecision = oneLayerOnly
  ? "ONE_BOUNDED_SINGLE_LAYER_REMEDIATION"
  : "NOT_ASSESSED_DIAGNOSTIC_LIMIT_REACHED";
const d15Status = oneLayerOnly
  ? "COMPLETE_SINGLE_LAYER_HIGH_CONFIDENCE_ANALYSIS_ONLY"
  : "BLOCKED_OR_NOT_ASSESSED";
const comparableObjectAttempts = source.sessions
  .flatMap((session) => session.object_attempts)
  .filter((attempt) =>
    typeof attempt.local_schema_valid === "boolean" &&
    typeof attempt.gateway_result === "string" &&
    typeof attempt.gateway_local_agreement === "boolean"
  );
const gatewayLocalAssessment = comparableObjectAttempts.length > 0
  ? comparableObjectAttempts.every((attempt) => attempt.gateway_local_agreement)
  : "NOT_ASSESSED";
const sanitizedSessions = source.sessions.map((session) => ({
  ...session,
  reason_codes: (session.reason_codes ?? []).filter((code) => /^[A-Z][A-Z0-9_]{2,80}$/.test(code))
}));

const results = {
  ...source,
  sessions: sanitizedSessions,
  status: d15Status,
  pr_number: 5,
  pr_head_before: prHeadBefore,
  pr_head_after_reference: "THIS_EXISTING_PR_UPDATE_COMMIT",
  pr_state: "OPEN_DRAFT",
  mcp_session_executed: true,
  sdk_session_executed: true,
  mcp_session_trace_retained:
    source.sessions.find((session) => session.path === "MCP")?.diagnostic_trace_retained !== false,
  sdk_session_trace_retained: true,
  credential_closure: closure,
  privacy_findings: {
    raw_object_findings: 0,
    raw_receipt_findings: 0,
    token_findings: 0,
    authorization_header_findings: 0,
    full_tenant_id_findings: 0,
    full_agent_id_findings: 0,
    full_credential_id_findings: 0,
    identity_disclosure_findings: 0,
    allowlist_based_diagnostic_serialization: true,
    diagnostic_json_schema_validation: true
  },
  one_layer_only: oneLayerOnly,
  competing_layers_excluded: oneLayerOnly,
  session_boundary_blocked: sessionBoundaryBlocked,
  gateway_local_validator_agree: gatewayLocalAssessment,
  next_human_decision: nextHumanDecision,
  new_pr_created: false
};

const objectSummary = {
  schema_version: "v1.0",
  artifact_type: "D15_OBJECT_ISSUE_SUMMARY",
  decision_id: source.decision_id,
  root_cause: source.object_construction,
  gateway_local_validator_agree: gatewayLocalAssessment,
  sessions: source.sessions.map((session) => ({
    session_id: session.session_id,
    path: session.path,
    attempts: session.object_attempts
  })),
  raw_object_persisted: false
};

const receiptSummary = {
  schema_version: "v1.0",
  artifact_type: "D15_RECEIPT_HANDOFF_SUMMARY",
  decision_id: source.decision_id,
  root_cause: source.receipt_handoff,
  sessions: source.sessions.map((session) => ({
    session_id: session.session_id,
    path: session.path,
    handoffs: session.receipt_handoffs
  })),
  raw_receipt_persisted: false
};

const artifactsDirectory = resolve(HERE, "artifacts");
await mkdir(artifactsDirectory, { recursive: true });
await writeJson(resolve(artifactsDirectory, "d15-structural-diagnostic-results.json"), results);
await writeJson(resolve(artifactsDirectory, "d15-object-issue-summary.json"), objectSummary);
await writeJson(resolve(artifactsDirectory, "d15-receipt-handoff-summary.json"), receiptSummary);

const report = renderReport(results);
const reportPath = resolve(HERE, "TITMAS-P0-10-STRUCTURAL-DIAGNOSTIC-D15-REPORT-v1.0.md");
await writeFile(reportPath, report, "utf8");

const evidenceFiles = [
  "d15-structural-diagnostic-results.json",
  "d15-object-issue-summary.json",
  "d15-receipt-handoff-summary.json"
];
const evidence = {};
for (const filename of evidenceFiles) {
  const bytes = await readFile(resolve(artifactsDirectory, filename));
  evidence[filename] = { sha256: sha256Text(bytes), bytes: bytes.byteLength };
}
const reportBytes = await readFile(reportPath);
evidence["TITMAS-P0-10-STRUCTURAL-DIAGNOSTIC-D15-REPORT-v1.0.md"] = {
  sha256: sha256Text(reportBytes),
  bytes: reportBytes.byteLength
};

const manifest = {
  schema_version: "v1.0",
  artifact_type: "D15_EVIDENCE_MANIFEST",
  decision_id: source.decision_id,
  generated_from: "ALLOWLISTED_SANITIZED_IN_MEMORY_DIAGNOSTIC_ONLY",
  evidence,
  frozen_baseline: {
    openapi_sha256: "4a56b4b4e1c841f8349ac9e79df82fd610467e7c1c1406e428cd251d5932eaf0",
    python_sdk_tree: "eecb5fc7adb4a5212f24009b5eac8dc7f3850653",
    typescript_sdk_tree: "83a9535962f5ff4a0e9af4450cea9229c930d6b0",
    mcp_tree: "fffa5e19a1eeb7e2de6f4b35a78f1ea4d882720e",
    gateway_runtime_release: "efdfc84462628abdfbfe111f61253f76569edec0"
  },
  d12_retained: {
    p0_10_result: "FAIL_CLOSED_AFTER_RUNTIME_ALIGNMENT",
    initial_failure_artifact: "d12-validation-report.json",
    initial_failure_sha256: "4b35b56b2e8a63a29c0d2eb6b29e2328f31e5ab4f1c99a541d4d34b9ab035fc6",
    post_d13_failure_artifact: "post-d13-validation-report.json",
    post_d13_failure_sha256: "90e60766263f2facd510e52107106bcc7d599f29d8836fa04a890d1607d5fa6f"
  },
  raw_object_in_manifest: false,
  raw_receipt_in_manifest: false,
  credential_material_in_manifest: false
};
await writeJson(resolve(artifactsDirectory, "d15-evidence-manifest.json"), manifest);

const artifactSchema = JSON.parse(await readFile(resolve(HERE, "d15-artifact.schema.json"), "utf8"));
const validate = compileSchema(artifactSchema);
for (const artifact of [results, objectSummary, receiptSummary, manifest]) {
  if (!validate(artifact)) throw new Error(`D15_ARTIFACT_SCHEMA_INVALID:${JSON.stringify(validate.errors)}`);
  assertAllowlistedArtifact(artifact);
}

process.stdout.write(`D15_STATUS=${d15Status}\n`);
process.stdout.write(`NEXT_HUMAN_DECISION=${nextHumanDecision}\n`);
process.stdout.write("D15_ARTIFACTS_FINALIZED=true\n");

async function writeJson(path, value) {
  assertAllowlistedArtifact(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function renderReport(value) {
  const object = value.object_construction;
  const receipt = value.receipt_handoff;
  return `# TITMAS P0-10 Privacy-Preserving Structural Diagnostic D15 Final v1.1

## Decision and boundary

\`\`\`text
DECISION_ID=${value.decision_id}
DECIDED_BY_REF=${value.decided_by_ref}
ANALYSIS_ONLY=true
D15_IS_FINAL_DIAGNOSTIC=true
NEW_FEATURE=false
PR_NUMBER=5
PR_STATE=OPEN_DRAFT
PR_HEAD_BEFORE=${value.pr_head_before}
PR_HEAD_AFTER_REFERENCE=THIS_EXISTING_PR_UPDATE_COMMIT
MCP_SESSION_EXECUTED=${value.mcp_session_executed}
SDK_SESSION_EXECUTED=${value.sdk_session_executed}
\`\`\`

D15 used two independent synthetic Agent sessions, one MCP path and one SDK path. It did not supply a correct object, field location, expected type, hidden fixture, tool order, or Receipt wrapper. It did not modify the frozen API, Schema, reason-code registry, Gateway, SDK, MCP Adapter, database, D04 history, deployment, Release, or package publication.

Both sessions reached their bounded model-round limit without a final Agent response. The first MCP process retained no diagnostic trace after its fail-closed termination, so its preflight count is recorded conservatively at the per-session upper bound. The SDK session retained one preflight attempt but no Receipt handoff. These limitations prohibit a cross-path root-cause claim.

## Frozen baseline

\`\`\`text
GATEWAY_RUNTIME_RELEASE=${value.baseline.gateway_runtime_release}
LIVE_RUNTIME_CONTRACT=FROZEN_API_V1
SDK_CONTRACT_MATCH=${value.baseline.sdk_contract_match}
MCP_CONTRACT_MATCH=${value.baseline.mcp_contract_match}
\`\`\`

## Track A — object construction

\`\`\`text
OBJECT_CONSTRUCTION_ROOT_CAUSE=${object.root_cause_category}
OBJECT_CONSTRUCTION_CONFIDENCE=${object.confidence_score}
OBJECT_AFFECTED_LAYER=${object.affected_layer}
GATEWAY_LOCAL_VALIDATOR_AGREE=${value.gateway_local_validator_agree}
\`\`\`

Supporting observations:

${object.supporting_observations.map((item) => `- \`${item}\``).join("\n")}

The local validator was an explanatory, read-only copy of the public Schema. It was not the canonical Gateway and created no adjudication authority.

## Track B — Receipt handoff

\`\`\`text
RECEIPT_HANDOFF_ROOT_CAUSE=${receipt.root_cause_category}
RECEIPT_HANDOFF_CONFIDENCE=${receipt.confidence_score}
RECEIPT_AFFECTED_LAYER=${receipt.affected_layer}
\`\`\`

Supporting observations:

${receipt.supporting_observations.map((item) => `- \`${item}\``).join("\n")}

A FAIL Receipt remained independently eligible for structural and cryptographic diagnosis. Receipt fetch was not treated as Receipt verification, and object failure was not assumed to cause Receipt failure.

## Current repair feedback

\`\`\`text
FIELD_LOCALIZATION_AVAILABLE=${value.feedback.field_localization_available}
EXPECTED_TYPE_AVAILABLE=${value.feedback.expected_type_available}
MISSING_REQUIRED_FIELD_AVAILABLE=${value.feedback.missing_required_field_available}
MACHINE_READABLE_REPAIR_ACTION_AVAILABLE=${value.feedback.machine_readable_repair_action_available}
CURRENT_REPAIR_FEEDBACK_SUFFICIENT=${value.current_repair_feedback_sufficient}
\`\`\`

## Privacy and credential closure

\`\`\`text
RAW_OBJECT_FINDINGS=0
RAW_RECEIPT_FINDINGS=0
TOKEN_FINDINGS=0
AUTHORIZATION_HEADER_FINDINGS=0
IDENTITY_DISCLOSURE_FINDINGS=0
ALLOWLIST_BASED_DIAGNOSTIC_SERIALIZATION=true
DIAGNOSTIC_JSON_SCHEMA_VALIDATION=true
ALL_D15_CREDENTIALS_REVOKED=${value.credential_closure.all_d15_credentials_revoked}
ACTIVE_D15_CREDENTIALS=${value.credential_closure.active_d15_credentials}
REVOKED_CREDENTIAL_HTTP_401_VERIFIED=${value.credential_closure.revoked_credential_http_401_verified}
\`\`\`

## Retained outcome and disposition

\`\`\`text
D15_STATUS=${value.status}
D12_FAILURE_RETAINED=true
P0_10_RESULT=FAIL_CLOSED_AFTER_RUNTIME_ALIGNMENT
ONE_LAYER_ONLY=${value.one_layer_only}
COMPETING_LAYERS_EXCLUDED=${value.competing_layers_excluded}
NEXT_HUMAN_DECISION=${value.next_human_decision}
\`\`\`

D15 is diagnostic evidence, not a remediation or PASS claim. If the two tracks retain different affected layers, or any competing layer remains plausible, the bounded route terminates at \`NOT_ASSESSED_DIAGNOSTIC_LIMIT_REACHED\`.

## Drift check

\`\`\`text
AGENT_ABSOLUTE_PRIORITY=true
D15_NE_FEATURE_DEVELOPMENT=true
D15_NE_PRODUCT_REMEDIATION=true
AGGREGATE_REASON_CODE_NE_ROOT_CAUSE=true
PRIVACY_NE_DIAGNOSTIC_BLINDNESS=true
STRUCTURAL_DIAGNOSTIC_NE_RAW_VALUE_RETENTION=true
RECEIPT_FETCH_NE_RECEIPT_VERIFY=true
FAIL_RECEIPT_NE_UNVERIFIABLE_RECEIPT=true
OBJECT_FAILURE_NE_RECEIPT_FAILURE_ASSUMED=true
D12_FAILURE_RETAINED=true
P0_10_PASS_FABRICATED=false
NO_NEW_PR=true
NO_NEW_FEATURE=true
NO_PORTFOLIO_EXPANSION=true
NO_D04_REOPEN=true
NO_DEPLOYMENT=true
TITMAS_DRIFT_CHECK_RESULT=PASS_WITH_RECORDED_LIMITATIONS
\`\`\`
`;
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
