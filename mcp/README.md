# TITMAS MCP Adapter

Pinned baseline: `@modelcontextprotocol/sdk@1.30.0`.

```bash
cd ../sdk/typescript
npm ci
npm run build
cd ../../mcp
npm ci
npm run build

TITMAS_CREDENTIAL=delegated-machine-credential \
TITMAS_TENANT_ID=delegated-tenant-uuid \
TITMAS_AGENT_ID=delegated-agent-uuid \
node dist/server.js
```

The stdio server exposes bounded tools:

- `titmas_capabilities`
- `titmas_preflight`
- `titmas_verify_receipt`
- `titmas_quota`

It does not expose Tenant creation, credential creation, payment, deployment,
formal conformance, Certification, or core source access.
