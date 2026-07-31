# TITMAS Agent Integrations

Public-safe SDKs and adapters for the TITMAS Agent-Native Commercial
Infrastructure Candidate.

An AI Agent can use this repository to:

1. discover the machine API;
2. inspect capabilities and plan limits;
3. submit a bounded object for Schema preflight;
4. preserve `PASS`, `FAIL`, and `NOT_ASSESSED`;
5. verify a signed Receipt;
6. inspect its Tenant quota and usage;
7. reuse the same client in another task.

## Machine entry

```json
{
  "service": "https://redcrag.cn",
  "openapi": "https://redcrag.cn/api/v1/openapi.json",
  "capabilities": "https://redcrag.cn/api/v1/capabilities",
  "plans": "https://redcrag.cn/api/v1/plans",
  "receipt_keys": "https://redcrag.cn/api/v1/receipt-keys"
}
```

## Source surfaces

| Surface | Location | Pinned integration baseline |
|---|---|---|
| Python SDK | `sdk/python/` | Python 3.11-3.13, httpx 0.28.1 |
| TypeScript SDK | `sdk/typescript/` | Node 22+, TypeScript 7.0.2 |
| MCP stdio server | `mcp/` | MCP TypeScript SDK 1.30.0 |
| LangChain tools | `langchain/` | LangChain 1.3.14 |
| OpenAI Agents tools | `openai-agents/` | openai-agents 0.19.1 |

Exact versions were checked against their official package registries on
2026-07-31. They are compatibility baselines, not claims of adoption by those
projects.

## Reviewed contract observation

- Live contract: `https://redcrag.cn/api/v1/openapi.json`
- Reviewed observation: `openapi/titmas-commercial-api-v1.observed.json`
- Provenance and digest: `openapi/source-manifest.json`

The live contract remains the current public source. The reviewed observation
exists for reproducible testing and explicit drift review. The service reports
version `6962da0…`, while the retained live release is `9bbfce6…`; the manifest
records this as known runtime metadata drift and does not represent either value
as the other.

## Permanent boundaries

- This repository does not contain the private TITMAS core.
- Schema preflight is not formal conformance.
- A Receipt verifies structure, digest and signature; it does not prove truth.
- A plan does not grant authority.
- No adapter creates a Tenant, credential, payment, Certification, or standard
  adoption.
- POST requests are never silently retried. Callers reuse an idempotency key
  only after resolving whether dispatch occurred.
- Python and TypeScript clients fail closed if a response tries to elevate
  Conformance, Certification, Truth, or Authorization.

## Current limitations

- Packages are source candidates and are not published to package registries.
- Public credential self-registration is unavailable.
- Python 3.14 is outside the current declared runtime range.
- The OpenAPI observation is not a generated full-schema client contract; some
  live response schemas remain intentionally generic.
- Production support, paid launch, formal Conformance, and Certification are
  not authorized.

See [`agent-entry.json`](agent-entry.json) for the compact machine-readable
entry and each surface README for clean-install commands.
