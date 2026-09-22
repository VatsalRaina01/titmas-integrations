# TITMAS Agent Integrations

Public-safe SDKs and adapters for the TITMAS Agent-Native Commercial
Infrastructure Candidate.

## Current public usability

The runnable public TITMAS experience is the frozen, deterministic
[TITMAS Digital Cell Demo](https://github.com/joy7758/titmas-demo). It requires
only Python 3.9+ and no credential, network service, package registry, or
private repository access:

```bash
git clone https://github.com/joy7758/titmas-demo.git
cd titmas-demo/examples/digital-cell
python3 run.py
```

The commercial API previously observed at `https://redcrag.cn/api/v1` is not a
current public service. Its URL is retained only as historical contract
provenance. The SDKs and adapters in this repository remain source candidates;
they do not grant a live origin or credential.

```text
PUBLIC_REFERENCE_STATUS=AVAILABLE
PUBLIC_REFERENCE_REPOSITORY=https://github.com/joy7758/titmas-demo
LIVE_SERVICE_STATUS=UNAVAILABLE
LIVE_SERVICE_CALLS_SUPPORTED=false
SDK_AND_ADAPTER_STATUS=SOURCE_CANDIDATE
```

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
  "public_reference": "https://github.com/joy7758/titmas-demo",
  "public_release": "https://github.com/joy7758/titmas-demo/releases/tag/v0.1.0",
  "live_service_status": "UNAVAILABLE",
  "service_base_url": null,
  "source_candidate_entry": "agent-entry.json"
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

- Historical observed contract: `https://redcrag.cn/api/v1/openapi.json`
- Reviewed observation: `openapi/titmas-commercial-api-v1.observed.json`
- Provenance and digest: `openapi/source-manifest.json`

The older observation remains historical review evidence. It is not a current
service endpoint or live truth source. D08 generation does not use it and does
not represent it as the frozen API v1 contract.

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

- The historical `redcrag.cn` service origin is unavailable and must not be
  presented as a current public API.
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

The MCP source candidate's transitive dependency audit and lock-only
remediation are recorded in
[`MCP-TRANSITIVE-DEPENDENCY-REMEDIATION-v1.0.md`](MCP-TRANSITIVE-DEPENDENCY-REMEDIATION-v1.0.md).
This does not publish or deploy the MCP package.

## External Agent onboarding validation

The D12 synthetic onboarding run is recorded under
[`validation/external-agent-onboarding/`](validation/external-agent-onboarding/).
D12 initially found a runtime-contract divergence. D13 later aligned that
contract, but D15 still closed the Agent-first acceptance gate. The historical
service origin is now unavailable, so no live onboarding path is claimed.

Current status:

```text
P0_10_RESULT=FAIL_CLOSED_AFTER_RUNTIME_ALIGNMENT
API_IS_CANONICAL=false
ACTIVE_D12_CREDENTIALS=0
LIVE_SERVICE_STATUS=UNAVAILABLE
LIVE_SERVICE_CALLS_SUPPORTED=false
```

Do not interpret source-level SDK/MCP tests as proof of live technical
onboarding. A future live service requires a separately authorized deployment,
fresh public readback, and a new external-Agent onboarding validation.
