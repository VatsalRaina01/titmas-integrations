# TITMAS MCP Adapter

Official source candidate for exposing the frozen TITMAS API v1 contract to
MCP-compatible Agents.

```text
MCP Agent
  -> official @modelcontextprotocol/sdk 1.30.0
    -> TITMAS MCP Adapter
      -> @titmas/agent-sdk 0.1.0
        -> frozen TITMAS API v1
```

The adapter owns MCP tool definitions, argument mapping, response envelopes,
error envelopes, and stdio transport handling. The TITMAS SDK remains the only
API client and HTTP transport. The adapter contains no `fetch`, Axios, Gateway
internal call, retry loop, or copied SDK implementation.

## Tool contract

| Tool | TITMAS SDK method | Access | Important semantics |
|---|---|---|---|
| `titmas_capabilities` | `capabilities()` | public | Capability discovery creates no Authority or Permission |
| `titmas_status` | `status()` | public | Status is not production readiness or adoption |
| `titmas_catalog` | `catalog()` | delegated | Catalog entries do not grant access |
| `titmas_preflight` | `preflight()` | delegated | Can consume quota and create a Receipt; `PASS` is not formal Conformance |
| `titmas_get_receipt` | `receipt()` | delegated | Receipt is not Truth, Authorization, or Certification |
| `titmas_verify_receipt` | `verifyReceipt()` | delegated | Verification is not Authorization or Truth |
| `titmas_usage` | `usage()` | delegated | Usage does not grant Permission |
| `titmas_quota` | `quota()` | delegated | Available quota does not grant Permission |

The complete machine-readable definition is
[`tool-contract.json`](tool-contract.json).

## Delegated context

Protected tools require all four variables:

```text
TITMAS_CREDENTIAL
TITMAS_CREDENTIAL_ID
TITMAS_TENANT_ID
TITMAS_AGENT_ID
```

`TITMAS_BASE_URL` is optional and defaults to `https://redcrag.cn`.
Credentials and delegated identity fields are process configuration. They are
not MCP tool arguments, tool results, fixtures, logs, or model prompt fields.
Public discovery tools remain available without delegated context; every
protected tool fails closed with `DELEGATED_CONTEXT_MISSING`.

## Build and test

Node.js 22 or newer is required.

```bash
cd titmas-typescript-sdk
npm ci
npm test

cd ../mcp
npm ci
npm test
```

Tests connect an official MCP `Client` and `McpServer` through the official
in-memory transport. They inject a fake TITMAS SDK interface, so they use no
network, real credential, Tenant, customer data, Receipt store, or quota.

## Run under an MCP host

After building, an MCP host may launch `node dist/server.js` over stdio with
the delegated environment above. This source candidate does not deploy a new
service or persistent TITMAS Runtime. Package publication, Release, Deployment,
public credential registration, payment, and production support remain closed.

## Failure contract

Known TITMAS SDK contract failures are returned as a bounded MCP error envelope
with a stable `reason_code`. Unknown SDK or transport failures return
`SDK_REQUEST_FAILED`, `retryable=false`, and no raw exception, URL, token, or
Gateway detail. The adapter never silently retries a request.

```text
PASS != FORMAL_CONFORMANCE
RECEIPT != TRUTH
VERIFICATION != AUTHORIZATION
SDK != AGENT_RUNTIME
MCP_ADAPTER != SERVICE_DEPLOYMENT
```
