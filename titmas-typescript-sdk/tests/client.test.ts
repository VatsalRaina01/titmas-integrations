import assert from "node:assert/strict";
import test from "node:test";

import type { DefaultApi, PreflightResult, ReceiptVerification } from "../generated/src/index.js";
import {
  TitmasAuthenticationError,
  TitmasClient,
  TitmasContractError
} from "../src/index.js";

function fakeApi(overrides: Partial<DefaultApi> = {}): DefaultApi {
  return {
    titmasPreflight: async () =>
      ({
        completedAt: new Date("2026-08-01T00:00:00Z"),
        reasonCodes: ["INSUFFICIENT_EVIDENCE"],
        receiptId: "30000000-0000-4000-8000-000000000001",
        requestId: "request-001",
        result: "NOT_ASSESSED",
        schemaId: null,
        schemaVersion: null
      }) satisfies PreflightResult,
    titmasVerifyReceipt: async () =>
      ({
        reasonCodes: ["OBJECT_INVALID"],
        valid: false,
        verificationStatus: "INVALID_SIGNATURE"
      }) satisfies ReceiptVerification,
    ...overrides
  } as DefaultApi;
}

test("uses generated API and preserves NOT_ASSESSED", async () => {
  let calls = 0;
  const api = fakeApi({
    titmasPreflight: async ({ preflightRequest }) => {
      calls += 1;
      assert.equal(preflightRequest.apiVersion, "v1");
      assert.equal(
        preflightRequest.credentialId,
        "40000000-0000-4000-8000-000000000001"
      );
      return {
        completedAt: new Date("2026-08-01T00:00:00Z"),
        reasonCodes: ["INSUFFICIENT_EVIDENCE"],
        receiptId: "30000000-0000-4000-8000-000000000001",
        requestId: preflightRequest.requestId,
        result: "NOT_ASSESSED",
        schemaId: null,
        schemaVersion: null
      };
    }
  });
  const client = new TitmasClient({
    credential: "synthetic-token",
    credentialId: "40000000-0000-4000-8000-000000000001",
    generatedApi: api
  });
  const outcome = await client.preflight({
    requestId: "request-001",
    idempotencyKey: "attempt-001",
    tenantId: "10000000-0000-4000-8000-000000000001",
    agentIdentity: "20000000-0000-4000-8000-000000000001",
    schemaId: "entity-object",
    schemaVersion: "v0.1",
    objectDigest: "0".repeat(64),
    object: {}
  });

  assert.equal(calls, 1);
  assert.equal(outcome.result, "NOT_ASSESSED");
  assert.equal(outcome.formal_conformance, false);
  assert.equal(outcome.truth_claim, false);
  assert.equal(outcome.authorization_effect, false);
});

test("Receipt verification remains structure-only and non-authoritative", async () => {
  const client = new TitmasClient({
    credential: "synthetic-token",
    credentialId: "credential-001",
    generatedApi: fakeApi()
  });
  const result = await client.verifyReceipt({
    receipt_id: "30000000-0000-4000-8000-000000000001",
    receipt_sequence: 1,
    result: "FAIL",
    signature_metadata: {},
    tenant_id: "10000000-0000-4000-8000-000000000001"
  });

  assert.equal(result.valid, false);
  assert.equal(result.verification_status, "INVALID_SIGNATURE");
  assert.equal(result.structure_only, true);
  assert.equal(result.truth_verified, false);
  assert.equal(result.authorization_effect, false);
});

test("invalid digest fails before the generated API is called", async () => {
  let calls = 0;
  const client = new TitmasClient({
    credential: "synthetic-token",
    credentialId: "credential-001",
    generatedApi: fakeApi({
      titmasPreflight: async () => {
        calls += 1;
        throw new Error("must not be called");
      }
    })
  });

  await assert.rejects(
    client.preflight({
      requestId: "request-001",
      idempotencyKey: "attempt-001",
      tenantId: "tenant-001",
      agentIdentity: "agent-001",
      schemaId: "entity-object",
      schemaVersion: "v0.1",
      objectDigest: "invalid",
      object: {}
    }),
    (error) =>
      error instanceof TitmasContractError &&
      error.reasonCode === "OBJECT_DIGEST_INVALID"
  );
  assert.equal(calls, 0);
});

test("missing credential context fails closed", async () => {
  const missingSecret = new TitmasClient({
    credentialId: "credential-001",
    generatedApi: fakeApi()
  });
  assert.throws(() => missingSecret.quota(), TitmasAuthenticationError);

  const missingId = new TitmasClient({
    credential: "synthetic-token",
    generatedApi: fakeApi()
  });
  await assert.rejects(
    missingId.preflight({
      requestId: "request-001",
      idempotencyKey: "attempt-001",
      tenantId: "tenant-001",
      agentIdentity: "agent-001",
      schemaId: "entity-object",
      schemaVersion: "v0.1",
      objectDigest: "0".repeat(64),
      object: {}
    }),
    TitmasAuthenticationError
  );
});
