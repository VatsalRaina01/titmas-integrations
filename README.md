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

## Installable surfaces

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

## Permanent boundaries

- This repository does not contain the private TITMAS core.
- Schema preflight is not formal conformance.
- A Receipt verifies structure, digest and signature; it does not prove truth.
- A plan does not grant authority.
- No adapter creates a Tenant, credential, payment, Certification, or standard
  adoption.
- POST requests are never silently retried. Callers reuse an idempotency key
  only after resolving whether dispatch occurred.

See [`agent-entry.json`](agent-entry.json) for the compact machine-readable
entry and each surface README for clean-install commands.
