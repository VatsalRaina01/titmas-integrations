import { TitmasClient } from "../sdk/typescript/dist/index.js";

const required = [
  "TITMAS_CREDENTIAL",
  "TITMAS_TENANT_ID",
  "TITMAS_AGENT_ID"
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`missing delegated environment variable ${name}`);
}

const client = new TitmasClient({ credential: process.env.TITMAS_CREDENTIAL });
const result = await client.preflight({
  requestId: "example-task-001",
  idempotencyKey: "example-task-001-attempt-1",
  tenantId: process.env.TITMAS_TENANT_ID,
  agentIdentity: process.env.TITMAS_AGENT_ID,
  object: { object_type: "UNKNOWN", version: "v0.1" }
});

console.log(result.result);
console.log((await client.verifyReceipt(result.receipt)).valid);
console.log((await client.quota()).remaining_requests);
