import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorityBoundariesCommercialOfferActiveEnum,
  AuthorityBoundariesEvidenceIsTruthEnum,
  AuthorityBoundariesPreflightIsFormalConformanceEnum,
  AuthorityBoundariesProductionReadyEnum,
  AuthorityBoundariesReceiptIsCertificationEnum,
  AuthorityBoundariesVerificationIsAuthorizationEnum,
  Configuration,
  DefaultApi,
  instanceOfAuthorityBoundaries,
  type PreflightRequest
} from "../generated/src/index.js";

test("generated authority boundaries accept only literal false", () => {
  const boundaries = {
    commercialOfferActive: AuthorityBoundariesCommercialOfferActiveEnum.False,
    evidenceIsTruth: AuthorityBoundariesEvidenceIsTruthEnum.False,
    preflightIsFormalConformance:
      AuthorityBoundariesPreflightIsFormalConformanceEnum.False,
    productionReady: AuthorityBoundariesProductionReadyEnum.False,
    receiptIsCertification: AuthorityBoundariesReceiptIsCertificationEnum.False,
    verificationIsAuthorization:
      AuthorityBoundariesVerificationIsAuthorizationEnum.False
  };

  assert.equal(instanceOfAuthorityBoundaries(boundaries), true);
  assert.equal(
    instanceOfAuthorityBoundaries({ ...boundaries, evidenceIsTruth: true }),
    false
  );
});

test("generated transport sends protected POST exactly once", async () => {
  const requests: Request[] = [];
  const fetchApi: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    return Response.json({
      completed_at: "2026-08-01T00:00:00Z",
      reason_codes: ["INSUFFICIENT_EVIDENCE"],
      receipt_id: "30000000-0000-4000-8000-000000000001",
      request_id: "request-001",
      result: "NOT_ASSESSED",
      schema_id: null,
      schema_version: null
    });
  };
  const api = new DefaultApi(
    new Configuration({
      basePath: "https://example.invalid",
      accessToken: "synthetic-token",
      fetchApi
    })
  );
  const preflightRequest: PreflightRequest = {
    agentId: "20000000-0000-4000-8000-000000000001",
    apiVersion: "v1",
    credentialId: "40000000-0000-4000-8000-000000000001",
    idempotencyKey: "attempt-001",
    object: {},
    objectDigest: "0".repeat(64),
    requestId: "request-001",
    schemaId: "entity-object",
    schemaVersion: "v0.1",
    tenantId: "10000000-0000-4000-8000-000000000001"
  };

  const response = await api.titmasPreflight({
    preflightRequest,
    idempotencyKey: "attempt-001"
  });

  assert.equal(response.result, "NOT_ASSESSED");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.method, "POST");
  assert.equal(requests[0]?.url, "https://example.invalid/api/v1/preflight");
  assert.equal(requests[0]?.headers.get("authorization"), "Bearer synthetic-token");
});

test("generated transport does not retry a failed POST", async () => {
  let calls = 0;
  const api = new DefaultApi(
    new Configuration({
      basePath: "https://example.invalid",
      accessToken: "synthetic-token",
      fetchApi: async () => {
        calls += 1;
        throw new TypeError("synthetic network failure");
      }
    })
  );

  await assert.rejects(
    api.titmasPreflight({
      preflightRequest: {
        agentId: "agent-001",
        apiVersion: "v1",
        credentialId: "credential-001",
        idempotencyKey: "attempt-001",
        object: {},
        objectDigest: "0".repeat(64),
        requestId: "request-001",
        schemaId: "entity-object",
        schemaVersion: "v0.1",
        tenantId: "tenant-001"
      },
      idempotencyKey: "attempt-001"
    })
  );
  assert.equal(calls, 1);
});
