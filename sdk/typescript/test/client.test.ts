import assert from "node:assert/strict";
import test from "node:test";

import {
  TitmasClient,
  TitmasTransportError
} from "../src/index.js";

test("preserves NOT_ASSESSED and authority boundaries", async () => {
  const fakeFetch: typeof fetch = async (input, init) => {
    assert.match(String(input), /\/api\/v1\/preflight$/);
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer synthetic"
    );
    return Response.json({
      result: "NOT_ASSESSED",
      reason_codes: ["SCHEMA_NOT_SUPPORTED"],
      schema_name: null,
      schema_version: null,
      object_type: "UNKNOWN",
      formal_conformance: false,
      certification: false,
      truth_claim: false,
      authorization_effect: false,
      receipt: { receipt_id: "synthetic" },
      idempotent_replay: false
    });
  };
  const client = new TitmasClient({
    credential: "synthetic",
    fetchImpl: fakeFetch
  });
  const result = await client.preflight({
    requestId: "r1",
    idempotencyKey: "i1",
    tenantId: "t1",
    agentIdentity: "a1",
    object: {}
  });
  assert.equal(result.result, "NOT_ASSESSED");
  assert.equal(result.truth_claim, false);
  assert.equal(result.authorization_effect, false);
});

test("retries GET but never retries POST", async () => {
  let getCalls = 0;
  let postCalls = 0;
  const fakeFetch: typeof fetch = async (_input, init) => {
    if (init?.method === "GET") {
      getCalls += 1;
      return getCalls === 1
        ? Response.json({ title: "temporary" }, { status: 503 })
        : Response.json({ operations: [] });
    }
    postCalls += 1;
    throw new TypeError("network outcome unknown");
  };
  const client = new TitmasClient({
    credential: "synthetic",
    fetchImpl: fakeFetch,
    getRetryAttempts: 1
  });
  assert.deepEqual(await client.capabilities(), { operations: [] });
  await assert.rejects(
    client.preflight({
      requestId: "r1",
      idempotencyKey: "i1",
      tenantId: "t1",
      agentIdentity: "a1",
      object: {}
    }),
    TitmasTransportError
  );
  assert.equal(getCalls, 2);
  assert.equal(postCalls, 1);
});
