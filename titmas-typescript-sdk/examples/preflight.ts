import { TitmasClient } from "../src/index.js";

const client = new TitmasClient({
  credential: process.env.TITMAS_CREDENTIAL,
  credentialId: process.env.TITMAS_CREDENTIAL_ID
});

const result = await client.preflight({
  requestId: "example-request-001",
  idempotencyKey: "example-request-001-attempt-1",
  tenantId: process.env.TITMAS_TENANT_ID ?? "",
  agentIdentity: process.env.TITMAS_AGENT_ID ?? "",
  schemaId: "entity-object",
  schemaVersion: "v0.1",
  objectDigest: "0".repeat(64),
  object: { object_type: "ENTITY", version: "v0.1" }
});

console.log(result);
