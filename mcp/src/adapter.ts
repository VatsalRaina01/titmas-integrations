import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  TitmasAuthenticationError,
  TitmasContractError,
  type PreflightInput
} from "@titmas/agent-sdk";
import { z } from "zod";

export const TITMAS_MCP_TOOLS = [
  "titmas_capabilities",
  "titmas_status",
  "titmas_catalog",
  "titmas_preflight",
  "titmas_get_receipt",
  "titmas_verify_receipt",
  "titmas_usage",
  "titmas_quota"
] as const;

export interface TitmasSdk {
  capabilities(): Promise<Record<string, unknown>>;
  status(): Promise<Record<string, unknown>>;
  catalog(): Promise<unknown>;
  preflight(input: PreflightInput): Promise<unknown>;
  receipt(receiptId: string): Promise<unknown>;
  verifyReceipt(receipt: Record<string, unknown>): Promise<unknown>;
  usage(): Promise<unknown>;
  quota(): Promise<unknown>;
}

export interface DelegatedContext {
  credentialConfigured: boolean;
  credentialId?: string;
  tenantId?: string;
  agentId?: string;
}

export interface TitmasMcpAdapterOptions {
  sdk: TitmasSdk;
  delegatedContext: DelegatedContext;
}

const noArguments = z.strictObject({});
const preflightArguments = z.strictObject({
  request_id: z.string().min(1).max(128),
  idempotency_key: z.string().min(1).max(128),
  schema_id: z.string().min(1).max(128),
  schema_version: z.string().min(1).max(64),
  object_digest: z.string().regex(/^[0-9a-f]{64}$/),
  object: z.unknown()
});
const receiptIdArguments = z.strictObject({
  receipt_id: z.string().min(1).max(128)
});
const receiptArguments = z.strictObject({
  receipt: z.record(z.string(), z.unknown())
});

const publicReadAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
} as const;

const protectedReadAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
} as const;

export function createTitmasMcpServer(
  options: TitmasMcpAdapterOptions
): McpServer {
  const { sdk, delegatedContext } = options;
  const server = new McpServer({
    name: "titmas-mcp-adapter",
    version: "0.1.0"
  });

  server.registerTool(
    "titmas_capabilities",
    {
      title: "Inspect TITMAS capabilities",
      description:
        "Read the bounded API v1 capability surface. This creates no Authority or Permission.",
      inputSchema: noArguments,
      annotations: publicReadAnnotations
    },
    async () => callSdk(() => sdk.capabilities())
  );

  server.registerTool(
    "titmas_status",
    {
      title: "Inspect TITMAS status",
      description:
        "Read bounded machine status. Service status is not production readiness or adoption.",
      inputSchema: noArguments,
      annotations: publicReadAnnotations
    },
    async () => callSdk(() => sdk.status())
  );

  server.registerTool(
    "titmas_catalog",
    {
      title: "Inspect the delegated TITMAS catalog",
      description:
        "Read the catalog through delegated context. Catalog entries do not grant access or Authority.",
      inputSchema: noArguments,
      annotations: protectedReadAnnotations
    },
    async () =>
      callSdk(() => {
        requireDelegatedContext(delegatedContext);
        return sdk.catalog();
      })
  );

  server.registerTool(
    "titmas_preflight",
    {
      title: "Run TITMAS Schema preflight",
      description:
        "Submit one idempotency-keyed API v1 Schema preflight. It can consume quota and create a Receipt; PASS is not formal Conformance.",
      inputSchema: preflightArguments,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (input) =>
      callSdk(() => {
        const context = requireDelegatedContext(delegatedContext);
        return sdk.preflight({
          requestId: input.request_id,
          idempotencyKey: input.idempotency_key,
          tenantId: context.tenantId,
          agentIdentity: context.agentId,
          credentialId: context.credentialId,
          schemaId: input.schema_id,
          schemaVersion: input.schema_version,
          objectDigest: input.object_digest,
          object: input.object
        });
      })
  );

  server.registerTool(
    "titmas_get_receipt",
    {
      title: "Fetch a TITMAS Receipt",
      description:
        "Fetch a Receipt through delegated context. A Receipt records bounded processing; it is not Truth, Authorization, or Certification.",
      inputSchema: receiptIdArguments,
      annotations: protectedReadAnnotations
    },
    async (input) =>
      callSdk(() => {
        requireDelegatedContext(delegatedContext);
        return sdk.receipt(input.receipt_id);
      })
  );

  server.registerTool(
    "titmas_verify_receipt",
    {
      title: "Verify a TITMAS Receipt",
      description:
        "Verify Receipt structure, digest, signature, and declared status only. Verification is not Authorization or Truth.",
      inputSchema: receiptArguments,
      annotations: protectedReadAnnotations
    },
    async (input) =>
      callSdk(() => {
        requireDelegatedContext(delegatedContext);
        return sdk.verifyReceipt(input.receipt);
      })
  );

  server.registerTool(
    "titmas_usage",
    {
      title: "Inspect delegated TITMAS usage",
      description:
        "Read usage through the delegated credential boundary. Usage records do not grant Permission.",
      inputSchema: noArguments,
      annotations: protectedReadAnnotations
    },
    async () =>
      callSdk(() => {
        requireDelegatedContext(delegatedContext);
        return sdk.usage();
      })
  );

  server.registerTool(
    "titmas_quota",
    {
      title: "Inspect delegated TITMAS quota",
      description:
        "Read quota through the delegated credential boundary. Quota availability is not Authority or Permission.",
      inputSchema: noArguments,
      annotations: protectedReadAnnotations
    },
    async () =>
      callSdk(() => {
        requireDelegatedContext(delegatedContext);
        return sdk.quota();
      })
  );

  return server;
}

function requireDelegatedContext(context: DelegatedContext): {
  tenantId: string;
  agentId: string;
  credentialId: string;
} {
  if (
    !context.credentialConfigured ||
    !context.tenantId ||
    !context.agentId ||
    !context.credentialId
  ) {
    throw new TitmasAuthenticationError(
      "delegated credential, credential ID, Tenant ID, and Agent ID are required",
      "DELEGATED_CONTEXT_MISSING"
    );
  }
  return {
    tenantId: context.tenantId,
    agentId: context.agentId,
    credentialId: context.credentialId
  };
}

async function callSdk(operation: () => Promise<unknown>) {
  try {
    const data = await operation();
    const payload = {
      ok: true,
      data,
      authority_effect: false
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload) }],
      structuredContent: payload
    };
  } catch (error) {
    const contractError =
      error instanceof TitmasContractError ||
      error instanceof TitmasAuthenticationError;
    const payload = {
      ok: false,
      error: {
        error_type: contractError ? error.name : "TitmasSdkError",
        reason_code: contractError ? error.reasonCode : "SDK_REQUEST_FAILED",
        message: contractError
          ? error.message
          : "The TITMAS SDK request failed without an authoritative result.",
        retryable: false
      },
      authority_effect: false
    };
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify(payload) }],
      structuredContent: payload
    };
  }
}
