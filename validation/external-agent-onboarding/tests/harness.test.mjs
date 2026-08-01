import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCredentialAbsent,
  canonicalSha256,
  containsCredential,
  countAuthorityOverclaims,
  stableStringify,
  validateEvidenceIntegrity,
  validateReport
} from "../lib.mjs";

test("canonical digest is stable across object key ordering", () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(canonicalSha256({ b: 2, a: 1 }), canonicalSha256({ a: 1, b: 2 }));
});

test("credential detector fails closed before provider or evidence output", () => {
  const token = `titmas_v1_${"a".repeat(32)}_${"B".repeat(43)}`;
  assert.equal(containsCredential({ value: token }, [token]), true);
  assert.throws(() => assertCredentialAbsent({ value: token }, [token]), /CREDENTIAL_DISCLOSURE_BLOCKED/);
  assert.doesNotThrow(() => assertCredentialAbsent({ value: "sha256:abc" }, [token]));
});

test("negated boundaries are not counted as authority overclaims", () => {
  assert.equal(countAuthorityOverclaims(["The receipt does not prove truth and is not certification."]), 0);
  assert.equal(countAuthorityOverclaims(["The receipt proves truth."]), 1);
});

test("report validator preserves the full success gate", () => {
  const session = {
    session_id: "agent-1",
    discovery_success: true,
    capability_read_success: true,
    schema_selection_success: true,
    preflight_success: true,
    receipt_verification_success: true,
    second_task_reuse: true
  };
  const report = {
    schema_version: "v0.1",
    synthetic_tenant_count: 1,
    agent_count: 2,
    sessions: [session, { ...session, session_id: "agent-2" }],
    authority_overclaim_count: 0,
    token_disclosure_count: 0,
    scope_violation_count: 0,
    drift_check: { result: "PASS_WITH_RECORDED_LIMITATIONS" }
  };
  assert.deepEqual(validateReport(report), { valid: true, errors: [] });
  report.sessions[0].preflight_success = false;
  assert.equal(validateReport(report).valid, false);
});

test("a fail-closed experiment can preserve valid evidence without claiming PASS", () => {
  const report = {
    schema_version: "v0.1",
    synthetic_tenant_count: 1,
    agent_count: 2,
    sessions: [{}, {}],
    authority_overclaim_count: 0,
    token_disclosure_count: 0,
    scope_violation_count: 0,
    changes: {
      api_contract: false,
      sdk: false,
      mcp: false,
      database_schema: false,
      deployment: false
    }
  };
  assert.deepEqual(validateEvidenceIntegrity(report), { valid: true, errors: [] });
  assert.equal(validateReport(report).valid, false);
});
