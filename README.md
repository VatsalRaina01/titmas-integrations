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
| Python SDK | `titmas-python-sdk/` | generated transport; Python 3.11-3.13 |
| TypeScript SDK | `titmas-typescript-sdk/` | generated transport; Node 22+ |
| MCP stdio adapter | `mcp/` | implemented source candidate; official MCP SDK 1.30.0 over TITMAS SDK |
| LangChain tools | `langchain/` | LangChain 1.3.14 |
| OpenAI Agents tools | `openai-agents/` | openai-agents 0.19.1 |

Exact versions were checked against their official package registries on
2026-07-31. They are compatibility baselines, not claims of adoption by those
projects.

## Frozen generation contract

- Generation input: `openapi/titmas-api-v1.yaml`
- SHA-256: `4a56b4b4e1c841f8349ac9e79df82fd610467e7c1c1406e428cd251d5932eaf0`
- API contract merge: `efdfc84462628abdfbfe111f61253f76569edec0`
- Generator: OpenAPI Generator `7.24.0`, pinned in `sdk-generation.lock.json`

`generated/` is never hand-edited. `src/` adds bounded TITMAS semantics and
calls only generated API classes; it contains no second transport client.
`sdk/python` and `sdk/typescript` are compatibility symlinks, not duplicate
implementations.

## Historical contract observation

- Live contract: `https://redcrag.cn/api/v1/openapi.json`
- Reviewed observation: `openapi/titmas-commercial-api-v1.observed.json`
- Provenance and digest: `openapi/source-manifest.json`

The older live observation remains historical review evidence. D08 generation
does not use it and does not represent it as the frozen API v1 contract.

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
- Some frozen API response schemas remain intentionally generic and therefore
  generate `unknown`/`Any` return values.
- LangChain and OpenAI Agents adapters have not yet been migrated to provide
  the new `credential_id`, `schema_version` and `object_digest` fields. Their
  source remains a separate mapping candidate.
- The MCP adapter is implemented and contract-tested as a source candidate;
  its package is not published and no MCP service or TITMAS Runtime is
  deployed by this repository.
- Production support, paid launch, formal Conformance, and Certification are
  not authorized.

See [`agent-entry.json`](agent-entry.json) for the compact machine-readable
entry and each surface README for clean-install commands.
