# TITMAS TypeScript SDK

```bash
npm ci
npm run build
```

```ts
import { TitmasClient } from "@titmas/agent-sdk";

const client = new TitmasClient({
  baseUrl: "https://redcrag.cn",
  credential: process.env.TITMAS_CREDENTIAL
});

const result = await client.preflight({
  requestId: "task-001",
  idempotencyKey: "task-001-attempt-1",
  tenantId: process.env.TITMAS_TENANT_ID!,
  agentIdentity: process.env.TITMAS_AGENT_ID!,
  object: { object_type: "UNKNOWN", version: "v0.1" }
});

if (result.result === "NOT_ASSESSED") {
  // Preserve uncertainty; do not rewrite this as FAIL.
}
```

Only bounded GET requests retry. POST transport failures produce
`TitmasTransportError` with `POST_DISPATCH_UNKNOWN`.
