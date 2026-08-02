import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  assertAllowlistedArtifact,
  compileSchema,
  publicErrorObservation,
  sanitizeValidationIssues,
  sha256Text,
  structuralSkeleton
} from "../d15-lib.mjs";


const artifactDirectory = resolve("artifacts");
const artifactSchema = JSON.parse(await readFile(resolve("d15-artifact.schema.json"), "utf8"));
const results = await readJson("d15-structural-diagnostic-results.json");
const objectSummary = await readJson("d15-object-issue-summary.json");
const receiptSummary = await readJson("d15-receipt-handoff-summary.json");
const manifest = await readJson("d15-evidence-manifest.json");
const fixtureSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["title", "count"],
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    count: { type: "integer" },
    nested: {
      type: "object",
      required: ["enabled"],
      additionalProperties: false,
      properties: { enabled: { type: "boolean" } }
    }
  }
};
const fixtureValue = { title: 17, nested: {}, private_alias: "never persist" };
const fixtureValidator = compileSchema(fixtureSchema);
fixtureValidator(fixtureValue);
const fixtureIssues = sanitizeValidationIssues(
  fixtureValidator.errors ?? [],
  fixtureValue,
  fixtureSchema
);
const fixtureSkeleton = structuralSkeleton(fixtureValue, fixtureSchema);

test("D15-T01 raw object not persisted", () => {
  assert.equal(objectSummary.raw_object_persisted, false);
  assert.doesNotThrow(() => assertAllowlistedArtifact(objectSummary));
});

test("D15-T02 raw Receipt not persisted", () => {
  assert.equal(receiptSummary.raw_receipt_persisted, false);
  assert.doesNotThrow(() => assertAllowlistedArtifact(receiptSummary));
});

test("D15-T03 values removed from object skeleton", () => {
  const serialized = JSON.stringify(fixtureSkeleton);
  assert.doesNotMatch(serialized, /never persist/);
  assert.doesNotMatch(serialized, /"title"\s*:\s*17/);
});

test("D15-T04 public JSON pointers retained", () => {
  assert.equal(fixtureSkeleton.public_contract_paths.includes("/title"), true);
  assert.equal(fixtureSkeleton.public_contract_paths.includes("/nested"), true);
});

test("D15-T05 unknown field names hashed", () => {
  const serialized = JSON.stringify({ fixtureSkeleton, fixtureIssues });
  assert.doesNotMatch(serialized, /private_alias/);
  assert.match(serialized, /<unknown:[0-9a-f]{16}>/);
});

test("D15-T06 observed and expected types recorded", () => {
  const issue = fixtureIssues.find((item) => item.json_pointer === "/title");
  assert.equal(issue.observed_json_type, "integer");
  assert.deepEqual(issue.expected_json_types, ["string"]);
});

test("D15-T07 missing required fields recorded", () => {
  const missing = fixtureIssues.filter((item) => item.required_property_missing === true);
  assert.equal(missing.some((item) => item.json_pointer === "/count"), true);
  assert.equal(missing.some((item) => item.json_pointer === "/nested/enabled"), true);
});

test("D15-T08 Gateway/local validation compared", () => {
  assert.equal(
    typeof results.gateway_local_validator_agree === "boolean" ||
      results.gateway_local_validator_agree === "NOT_ASSESSED",
    true
  );
  assert.equal(results.sessions.every((session) => session.object_attempts.every((attempt) =>
    typeof attempt.gateway_local_agreement === "boolean" ||
      attempt.gateway_local_agreement === "NOT_ASSESSED"
  )), true);
});

test("D15-T09 preflight response skeleton valid", () => {
  assertObservedOrFailClosed(
    allHandoffs().filter((handoff) => handoff.preflight_response_contract_valid === true).length
  );
});

test("D15-T10 get_receipt response skeleton valid", () => {
  assertObservedOrFailClosed(
    allHandoffs().filter((handoff) => handoff.get_receipt_response_contract_valid === true).length
  );
});

test("D15-T11 verify_receipt request skeleton valid", () => {
  assertObservedOrFailClosed(
    allHandoffs().filter((handoff) =>
      typeof handoff.verify_receipt_request_contract_valid === "boolean" &&
      handoff.verify_receipt_request !== null
    ).length
  );
});

test("D15-T12 public error class retained", () => {
  const observation = publicErrorObservation({ error: { name: "TitmasContractError" } });
  assert.equal(observation.sdk_error_class, "TitmasContractError");
  assert.equal("message" in observation, false);
  assert.equal(allHandoffs().every((handoff) =>
    "public_error_code" in handoff && "sdk_error_class" in handoff && "mcp_error_class" in handoff
  ), true);
});

test("D15-T13 credentials absent from model input", () => {
  assert.equal(results.sessions.every((session) => session.credential_material_in_provider_input === false), true);
  assert.equal(results.privacy_findings.token_findings, 0);
  assert.equal(results.privacy_findings.authorization_header_findings, 0);
});

test("D15-T14 credentials revoked and HTTP 401 verified", () => {
  assert.equal(results.credential_closure.all_d15_credentials_revoked, true);
  assert.equal(results.credential_closure.active_d15_credentials, 0);
  assert.equal(results.credential_closure.revoked_credential_http_401_verified, true);
});

test("D15-T15 original D12 failure unchanged", async () => {
  assert.equal(results.d12_failure_retained, true);
  assert.equal(results.p0_10_result, "FAIL_CLOSED_AFTER_RUNTIME_ALIGNMENT");
  await assertDigest("d12-validation-report.json", manifest.d12_retained.initial_failure_sha256);
  await assertDigest("post-d13-validation-report.json", manifest.d12_retained.post_d13_failure_sha256);
});

test("D15-T16 frozen API/SDK/MCP unchanged", async () => {
  assert.equal(
    sha256Text(await readFile(resolve("../../openapi/titmas-api-v1.yaml"))),
    manifest.frozen_baseline.openapi_sha256
  );
  assert.equal(manifest.frozen_baseline.python_sdk_tree, "eecb5fc7adb4a5212f24009b5eac8dc7f3850653");
  assert.equal(manifest.frozen_baseline.typescript_sdk_tree, "83a9535962f5ff4a0e9af4450cea9229c930d6b0");
  assert.equal(manifest.frozen_baseline.mcp_tree, "fffa5e19a1eeb7e2de6f4b35a78f1ea4d882720e");
  assert.equal(results.changes.api, false);
  assert.equal(results.changes.sdk, false);
  assert.equal(results.changes.mcp, false);
});

test("D15-T17 result artifacts Schema-valid", () => {
  const validate = compileSchema(artifactSchema);
  for (const artifact of [results, objectSummary, receiptSummary, manifest]) {
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.doesNotThrow(() => assertAllowlistedArtifact(artifact));
  }
  assert.equal(results.mcp_session_executed, true);
  assert.equal(results.sdk_session_executed, true);
});

function allHandoffs() {
  return results.sessions.flatMap((session) => session.receipt_handoffs);
}

function assertObservedOrFailClosed(observationCount) {
  assert.equal(
    observationCount > 0 || results.status === "BLOCKED_OR_NOT_ASSESSED",
    true
  );
}

async function readJson(name) {
  return JSON.parse(await readFile(resolve(artifactDirectory, name), "utf8"));
}

async function assertDigest(name, expected) {
  assert.equal(sha256Text(await readFile(resolve(artifactDirectory, name))), expected);
}
