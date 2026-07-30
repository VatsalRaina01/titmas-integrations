#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TitmasClient } from "@titmas/agent-sdk";
import { z } from "zod";

const credential = process.env.TITMAS_CREDENTIAL;
const tenantId = process.env.TITMAS_TENANT_ID;
const agentIdentity = process.env.TITMAS_AGENT_ID;

if (!credential || !tenantId || !agentIdentity) {
  process.stderr.write(
    "TITMAS_CREDENTIAL, TITMAS_TENANT_ID and TITMAS_AGENT_ID are required\n"
  );
  process.exit(2);
}

const client = new TitmasClient({
  baseUrl: process.env.TITMAS_BASE_URL ?? "https://redcrag.cn",
  credential
});

const server = new McpServer({
  name: "titmas-commercial-candidate",
  version: "0.1.0"
});

server.registerTool(
  "titmas_capabilities",
  {
    title: "Inspect TITMAS capabilities",
    description:
      "Read machine capabilities and explicit unsupported operations. Creates no authority.",
    inputSchema: {}
  },
  async () => textResult(await client.capabilities())
);

server.registerTool(
  "titmas_preflight",
  {
    title: "Run TITMAS Schema preflight",
    description:
      "Return PASS, FAIL, or NOT_ASSESSED plus a signed Receipt. Not formal conformance.",
    inputSchema: {
      request_id: z.string().min(1).max(128),
      idempotency_key: z.string().min(1).max(128),
      object: z.record(z.string(), z.unknown()),
      schema_name: z.string().min(1).max(64).optional()
    }
  },
  async ({ request_id, idempotency_key, object, schema_name }) =>
    textResult(
      await client.preflight({
        requestId: request_id,
        idempotencyKey: idempotency_key,
        tenantId,
        agentIdentity,
        object,
        ...(schema_name === undefined ? {} : { schemaName: schema_name })
      })
    )
);

server.registerTool(
  "titmas_verify_receipt",
  {
    title: "Verify a TITMAS Receipt",
    description:
      "Verify Receipt structure, digest and signature. Does not verify truth or authority.",
    inputSchema: {
      receipt: z.record(z.string(), z.unknown())
    }
  },
  async ({ receipt }) => textResult(await client.verifyReceipt(receipt))
);

server.registerTool(
  "titmas_quota",
  {
    title: "Inspect delegated Tenant quota",
    description: "Read quota bound to the delegated machine credential.",
    inputSchema: {}
  },
  async () => textResult(await client.quota())
);

const transport = new StdioServerTransport();
await server.connect(transport);

function textResult(value: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }]
  };
}
