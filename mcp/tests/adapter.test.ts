import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { PreflightInput } from "@titmas/agent-sdk";

import {
  TITMAS_MCP_TOOLS,
  createTitmasMcpServer,
  type DelegatedContext,
  type TitmasSdk
} from "../src/adapter.js";

const delegatedContext: DelegatedContext = {
  credentialConfigured: true,
  credentialId: "40000000-0000-4000-8000-000000000001",
  tenantId: "10000000-0000-4000-8000-000000000001",
  agentId: "20000000-0000-4000-8000-000000000001"
};

function fakeSdk(overrides: Partial<TitmasSdk> = {}): TitmasSdk {
  return {
    capabilities: async () => ({ api_version: "v1" }),
    status: async () => ({ status: "BOUNDED_CANDIDATE" }),
    catalog: async () => ({ schemas: [] }),
    preflight: async () => ({
      result: "NOT_ASSESSED",
      reason_codes: ["INSUFFICIENT_EVIDENCE"],
      formal_conformance: false,
      authorization_effect: false
    }),
    receipt: async (receiptId) => ({ receipt_id: receiptId }),
    verifyReceipt: async () => ({
      valid: true,
      verification_status: "VALID",
      truth_verified: false,
      authorization_effect: false
    }),
    usage: async () => ({ consumed: 1 }),
    quota: async () => ({ remaining: 9 }),
    ...overrides
  };
}

async function connectedFixture(
  sdk: TitmasSdk,
  context: DelegatedContext = delegatedContext
) {
  const server = createTitmasMcpServer({ sdk, delegatedContext: context });
  const client = new Client({ name: "titmas-mcp-contract-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    async close() {
      await Promise.allSettled([client.close(), server.close()]);
    }
  };
}

function payload(result: unknown) {
  assert.ok(result && typeof result === "object" && "content" in result);
  const content = (result as { content: unknown }).content;
  assert.ok(Array.isArray(content));
  const text = content.find(
    (item): item is { type: "text"; text: string } =>
      item !== null &&
      typeof item === "object" &&
      "type" in item &&
      item.type === "text" &&
      "text" in item &&
      typeof item.text === "string"
  );
  assert.ok(text);
  return JSON.parse(text.text) as Record<string, unknown>;
}

test("lists the exact bounded tool contract without credential arguments", async () => {
  const fixture = await connectedFixture(fakeSdk());
  try {
    const listed = await fixture.client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name),
      [...TITMAS_MCP_TOOLS]
    );
    for (const tool of listed.tools) {
      const properties = tool.inputSchema.properties ?? {};
      assert.equal("credential" in properties, false);
      assert.equal("credential_id" in properties, false);
      assert.equal("tenant_id" in properties, false);
      assert.equal("agent_id" in properties, false);
    }
  } finally {
    await fixture.close();
  }
});

test("maps all frozen API v1 preflight fields to the TITMAS SDK once", async () => {
  const calls: PreflightInput[] = [];
  const fixture = await connectedFixture(
    fakeSdk({
      preflight: async (input) => {
        calls.push(input);
        return {
          result: "NOT_ASSESSED",
          reason_codes: ["INSUFFICIENT_EVIDENCE"],
          formal_conformance: false,
          authorization_effect: false
        };
      }
    })
  );
  try {
    const result = await fixture.client.callTool({
      name: "titmas_preflight",
      arguments: {
        request_id: "request-001",
        idempotency_key: "attempt-001",
        schema_id: "entity-object",
        schema_version: "v0.1",
        object_digest: "0".repeat(64),
        object: { sample: true }
      }
    });
    assert.equal(result.isError, undefined);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      requestId: "request-001",
      idempotencyKey: "attempt-001",
      tenantId: delegatedContext.tenantId,
      agentIdentity: delegatedContext.agentId,
      credentialId: delegatedContext.credentialId,
      schemaId: "entity-object",
      schemaVersion: "v0.1",
      objectDigest: "0".repeat(64),
      object: { sample: true }
    });
    assert.equal((payload(result).data as Record<string, unknown>).result, "NOT_ASSESSED");
  } finally {
    await fixture.close();
  }
});

test("fails protected tools closed when delegated context is incomplete", async () => {
  let calls = 0;
  const fixture = await connectedFixture(
    fakeSdk({
      quota: async () => {
        calls += 1;
        return {};
      }
    }),
    { credentialConfigured: false }
  );
  try {
    const result = await fixture.client.callTool({
      name: "titmas_quota",
      arguments: {}
    });
    assert.equal(result.isError, true);
    assert.equal(calls, 0);
    const parsed = payload(result);
    assert.equal(
      (parsed.error as Record<string, unknown>).reason_code,
      "DELEGATED_CONTEXT_MISSING"
    );
    assert.equal(parsed.authority_effect, false);
  } finally {
    await fixture.close();
  }
});

test("rejects credential context injected through tool arguments", async () => {
  let calls = 0;
  const fixture = await connectedFixture(
    fakeSdk({
      preflight: async () => {
        calls += 1;
        return {};
      }
    })
  );
  try {
    const result = await fixture.client.callTool({
      name: "titmas_preflight",
      arguments: {
        request_id: "request-001",
        idempotency_key: "attempt-001",
        schema_id: "entity-object",
        schema_version: "v0.1",
        object_digest: "0".repeat(64),
        object: {},
        credential_id: "attacker-controlled"
      }
    });
    assert.equal(result.isError, true);
    assert.equal(calls, 0);
  } finally {
    await fixture.close();
  }
});

test("maps unknown SDK failures without leaking internal error text", async () => {
  const fixture = await connectedFixture(
    fakeSdk({
      usage: async () => {
        throw new Error("Bearer secret-value at http://private-gateway/internal");
      }
    })
  );
  try {
    const result = await fixture.client.callTool({
      name: "titmas_usage",
      arguments: {}
    });
    const parsed = payload(result);
    const error = parsed.error as Record<string, unknown>;
    assert.equal(result.isError, true);
    assert.equal(error.reason_code, "SDK_REQUEST_FAILED");
    assert.equal(error.retryable, false);
    assert.doesNotMatch(JSON.stringify(parsed), /secret-value|private-gateway/);
  } finally {
    await fixture.close();
  }
});

test("preserves Receipt verification non-authority semantics", async () => {
  const fixture = await connectedFixture(fakeSdk());
  try {
    const result = await fixture.client.callTool({
      name: "titmas_verify_receipt",
      arguments: {
        receipt: {
          receipt_id: "30000000-0000-4000-8000-000000000001",
          receipt_sequence: 1,
          result: "PASS",
          signature_metadata: {},
          tenant_id: delegatedContext.tenantId
        }
      }
    });
    const data = payload(result).data as Record<string, unknown>;
    assert.equal(data.valid, true);
    assert.equal(data.truth_verified, false);
    assert.equal(data.authorization_effect, false);
  } finally {
    await fixture.close();
  }
});

test("maps receipt, usage, and quota through the SDK only", async () => {
  const called: string[] = [];
  const fixture = await connectedFixture(
    fakeSdk({
      receipt: async (receiptId) => {
        called.push(`receipt:${receiptId}`);
        return { receipt_id: receiptId };
      },
      usage: async () => {
        called.push("usage");
        return { consumed: 1 };
      },
      quota: async () => {
        called.push("quota");
        return { remaining: 9 };
      }
    })
  );
  try {
    await fixture.client.callTool({
      name: "titmas_get_receipt",
      arguments: { receipt_id: "30000000-0000-4000-8000-000000000001" }
    });
    await fixture.client.callTool({ name: "titmas_usage", arguments: {} });
    await fixture.client.callTool({ name: "titmas_quota", arguments: {} });
    assert.deepEqual(called, [
      "receipt:30000000-0000-4000-8000-000000000001",
      "usage",
      "quota"
    ]);
  } finally {
    await fixture.close();
  }
});

test("keeps public discovery callable without delegated credentials", async () => {
  const fixture = await connectedFixture(fakeSdk(), {
    credentialConfigured: false
  });
  try {
    const capabilities = await fixture.client.callTool({
      name: "titmas_capabilities",
      arguments: {}
    });
    const status = await fixture.client.callTool({
      name: "titmas_status",
      arguments: {}
    });
    assert.equal(capabilities.isError, undefined);
    assert.equal(status.isError, undefined);
  } finally {
    await fixture.close();
  }
});

test("matches the checked-in machine-readable tool contract", () => {
  const contract = JSON.parse(
    readFileSync(new URL("../../tool-contract.json", import.meta.url), "utf8")
  ) as { tools: Array<{ name: string }> };
  assert.deepEqual(
    contract.tools.map((tool) => tool.name),
    [...TITMAS_MCP_TOOLS]
  );
});
