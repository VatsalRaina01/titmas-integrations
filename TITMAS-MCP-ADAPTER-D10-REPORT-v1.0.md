# TITMAS MCP Adapter Implementation D10 Report v1.0

## Decision and scope

```text
DECISION_ID=TITMAS-FINAL-FORM-P0-MCP-ADAPTER-IMPLEMENTATION-D10
DECISION=AUTHORIZE_TITMAS_MCP_ADAPTER_IMPLEMENTATION
DECIDED_BY_REF=zhangbin
BASE_MAIN_COMMIT=4cb106d70f519db6d9864b6c43c3fc21cf7894ac
API_V1_CONTRACT_SHA256=4a56b4b4e1c841f8349ac9e79df82fd610467e7c1c1406e428cd251d5932eaf0
IMPLEMENTATION_BRANCH=codex/titmas-final-form-p0-mcp-adapter-d10
MAX_IMPLEMENTATION_PRS=1
IMPLEMENTATION_PR=4
IMPLEMENTATION_PR_URL=https://github.com/joy7758/titmas-integrations/pull/4
IMPLEMENTATION_PR_STATE=DRAFT
```

D10 migrates the existing incomplete `mcp/` candidate onto the frozen API v1
and merged TITMAS TypeScript SDK. It does not create a second adapter, API
client, service, or Runtime.

## Architecture result

```text
MCP Agent
  -> official @modelcontextprotocol/sdk 1.30.0
    -> TITMAS MCP Adapter
      -> @titmas/agent-sdk 0.1.0
        -> frozen TITMAS API v1
```

The adapter exposes eight tools:

1. `titmas_capabilities`;
2. `titmas_status`;
3. `titmas_catalog`;
4. `titmas_preflight`;
5. `titmas_get_receipt`;
6. `titmas_verify_receipt`;
7. `titmas_usage`;
8. `titmas_quota`.

`mcp/tool-contract.json` is the Agent-readable contract. Protected context is
environment-only. The adapter owns MCP definitions and mapping; the TITMAS SDK
owns the complete API transport.

## Validation evidence

| Check | Result |
|---|---|
| Official MCP client/server in-memory contract tests | `PASS 9/9` |
| TypeScript SDK tests | `PASS 7/7` |
| Aggregate Python adapter tests on Python 3.13 | `PASS 8/8` |
| Python Ruff | `PASS` |
| Python SDK mypy from its canonical package directory | `PASS` |
| Machine entry and OpenAPI observation tests | `PASS 3/3` |
| MCP package audit | `PASS 0 vulnerabilities` |
| MCP direct HTTP/Gateway transport scan | `PASS 0 findings` |
| Bounded secret-pattern scan | `PASS 0 findings` |
| Generated SDK working-tree diff | `PASS 0 changed files` |
| Local deterministic regeneration | `BLOCKED_LOCAL_NETWORK_DOWNLOAD`; GitHub CI remains required |

The first aggregate Python installation attempt used the workstation default
Python 3.14.5 and failed exactly because the frozen SDK supports
`>=3.11,<3.14`. Re-execution with Python 3.13.12, matching GitHub Actions,
passed. No runtime range was changed to hide the environment mismatch.

## Agent recommendation gate

The pre-development review returned `NOT_RECOMMENDED` for the old candidate.
After the bounded remediation, a fresh `qwen3.7-max` session returned
`RECOMMENDED` with zero blocking findings and `authority_effect=false`.
Recommendation is advisory and does not establish adoption or Release.

## Preserved boundaries

```text
API_CONTRACT_CHANGED=false
GENERATED_SDK_CHANGED=false
DIRECT_GATEWAY_CLIENT_CREATED=false
HANDWRITTEN_HTTP_CLIENT_CREATED=false
AUTOMATIC_RETRY_CREATED=false
DATABASE_CHANGED=false
RECEIPT_STORAGE_CHANGED=false
QUOTA_CHANGED=false
D04_MODIFIED=false
OTEL_ENABLED=false
NEW_SERVICE_CREATED=false
NEW_RUNTIME_CREATED=false
NEW_DATABASE_CREATED=false
NEW_PROVIDER_CREATED=false
PAYMENT_EXECUTED=false
CUSTOMER_DATA_PROCESSED=false
PACKAGE_PUBLISHED=false
RELEASE_CREATED=false
DEPLOYMENT_CREATED=false
```

## Remaining limitations and next gate

- The frozen preflight response does not repeat `object_digest`; callers retain
  their request digest.
- The MCP adapter is a source candidate, not a published package or deployed
  service.
- Local deterministic SDK regeneration could not download the already pinned
  generator because outbound GitHub/Maven TLS was unavailable. The frozen
  OpenAPI hash and generated trees are unchanged; the existing GitHub CI
  reproducibility job must pass before Human merge review.
- Merge, package publication, Release, Deployment, production support, public
  credentials, and customer use require separate decisions.

```text
MCP_ADAPTER_IMPLEMENTATION_COMPLETE=true
MCP_TOOL_CONTRACT_TEST_PASS=true
TITMAS_SDK_REUSED=true
OFFICIAL_MCP_SDK_USED=true
PR_CREATED=true
MERGE_AUTHORIZED=false
PACKAGE_PUBLICATION_AUTHORIZED=false
RELEASE_AUTHORIZED=false
DEPLOYMENT_AUTHORIZED=false
NEXT_DECISION=HUMAN_REVIEW_OF_D10_IMPLEMENTATION_PR_AFTER_CI_PASS
```

## TITMAS Drift Check

```text
TITMAS_DRIFT_CHECK
CORE_INTEROPERABILITY_OBJECTIVE_PRESERVED=true
NEW_CONTROL_AUTHORITY_CREATED=false
NEW_TRUTH_SOURCE_CREATED=false
DUPLICATE_EVIDENCE_OR_VERIFICATION_CREATED=false
RUNTIME_OR_EXECUTOR_CREATED=false
CURRENT_CAPABILITY_OVERCLAIMED=false
PUBLIC_LAUNCH_AUTHORIZED=false
COMMUNITY_ESTABLISHED=false
TITMAS_DRIFT_CHECK_RESULT=PASS_WITH_RECORDED_LIMITATIONS
```
