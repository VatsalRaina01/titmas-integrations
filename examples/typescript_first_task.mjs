import { TitmasClient } from "../titmas-typescript-sdk/dist/src/index.js";

const required = [
  "TITMAS_CREDENTIAL",
  "TITMAS_CREDENTIAL_ID",
  "TITMAS_TENANT_ID",
  "TITMAS_AGENT_ID",
  "TITMAS_OBJECT_DIGEST"
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`missing delegated environment variable ${name}`);
}

const client = new TitmasClient({
  credential: process.env.TITMAS_CREDENTIAL,
  credentialId: process.env.TITMAS_CREDENTIAL_ID
});
const result = await client.preflight({
  requestId: "example-task-001",
  idempotencyKey: "example-task-001-attempt-1",
  tenantId: process.env.TITMAS_TENANT_ID,
  agentIdentity: process.env.TITMAS_AGENT_ID,
  schemaId: "entity-object",
  schemaVersion: "v0.1",
  objectDigest: process.env.TITMAS_OBJECT_DIGEST,
  object: { object_type: "UNKNOWN", version: "v0.1" }
});

console.log(result.result);
const receipt = (await client.receipt(result.receipt_id)).receipt;
console.log((await client.verifyReceipt(receipt)).valid);
console.log((await client.quota()).remaining_requests);
