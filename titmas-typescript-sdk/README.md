# TITMAS TypeScript SDK

Transport and models in `generated/` come from the frozen
`openapi/titmas-api-v1.yaml` contract. `src/` is a bounded semantic wrapper and
contains no handwritten HTTP client.

```bash
npm ci
npm test
```

```ts
import { TitmasClient } from "@titmas/agent-sdk";

const client = new TitmasClient({
  credential: process.env.TITMAS_CREDENTIAL,
  credentialId: process.env.TITMAS_CREDENTIAL_ID
});

const outcome = await client.preflight({
  requestId: "agent-task-001",
  idempotencyKey: "agent-task-001-attempt-1",
  tenantId: process.env.TITMAS_TENANT_ID!,
  agentIdentity: process.env.TITMAS_AGENT_ID!,
  schemaId: "entity-object",
  schemaVersion: "v0.1",
  objectDigest: "0".repeat(64),
  object: { object_type: "ENTITY", version: "v0.1" }
});
```

`PASS` is not formal Conformance. Receipt verification is not Truth,
Authorization or Certification. Generated POST methods are called once; the
semantic wrapper implements no retry loop.

This is an unpublished source candidate. Regenerate only with
`../scripts/generate-sdks.sh`; never edit `generated/`.
