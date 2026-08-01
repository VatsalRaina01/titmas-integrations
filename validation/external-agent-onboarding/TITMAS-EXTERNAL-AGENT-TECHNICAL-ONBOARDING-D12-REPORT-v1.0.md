# TITMAS External Agent Technical Onboarding D12 Report v1.0

## Decision and result

```text
DECISION_ID=TITMAS-FINAL-FORM-P0-10-EXTERNAL-AGENT-TECHNICAL-ONBOARDING-D12
DECIDED_BY_REF=zhangbin
SYNTHETIC_TENANT_COUNT=1
AGENT_COUNT=2
DISCOVERY_PATH=MCP,SDK
INITIAL_RESULT=FAIL_CLOSED_MACHINE_CONTRACT_RUNTIME_DIVERGENCE
POST_D13_RESULT=FAIL_CLOSED_AFTER_RUNTIME_ALIGNMENT
SUCCESS_GATE_MET=false
```

D12 was executed. It did not pass. This distinction is intentional: a completed
validation run is not evidence that the validated onboarding path works.

## What passed

Two isolated `qwen3.7-max` Agent sessions started with the task goal and normal
machine capabilities, but no TITMAS tool name, API path, Schema name, or correct
call sequence.

The first Agent autonomously selected MCP. The second independently covered the
generated SDK path. Both accomplished:

- machine-entry discovery;
- capability and status reading;
- catalog reading;
- schema selection and schema retrieval;
- canonical object digest calculation;
- exact boundary recognition without claiming Authority or certification.

Across both sessions:

```text
TOOL_CALLS=43
AUTHORITY_OVERCLAIM_COUNT=0
TOKEN_DISCLOSURE_COUNT=0
SCOPE_VIOLATION_COUNT=0
SCOPE_DENIAL_COUNT=3
```

Three out-of-scope attempts were denied. A denied attempt is recorded separately
from a successful scope violation. No unauthorized operation succeeded.

## Blocking finding

The frozen contract used to generate the SDK and MCP adapter is:

```text
openapi/titmas-api-v1.yaml
SHA256=4a56b4b4e1c841f8349ac9e79df82fd610467e7c1c1406e428cd251d5932eaf0
API_CONTRACT_MERGE=efdfc84462628abdfbfe111f61253f76569edec0
```

It sends fields including `agent_id`, `credential_id`, `schema_id`,
`schema_version`, and `object_digest`. The live release
`314cc178ea4f99c1b39e2a6d5ea9706f56d596f9` exposes a different
`PreflightEnvelope` requiring `agent_identity` and `timestamp` and rejects the
frozen fields. Both Agent paths therefore received HTTP `422`.

The exact observed problem was:

```text
missing required fields: agent_identity, timestamp
```

This is one cross-surface failure:

```text
Machine entry / frozen OpenAPI / generated SDK / MCP
                           !=
                    live runtime contract
```

The failure is not repaired in D12 because API, SDK, MCP, deployment, database
Schema, quota, Receipt storage, and D04 changes were all forbidden.

## Existing-surface audit

The host also contains an already-running bounded Sandbox Preview. A read-only
interface audit confirmed that it is a separate legacy validation surface: it
does not implement the frozen API v1 envelope or the current SDK/MCP preflight
and Receipt flow. It therefore cannot be used as a hidden compatibility route
for D12.

```text
ALIGNED_EXISTING_ENDPOINT_FOUND=false
NEW_RUNTIME_STARTED=false
DEPLOYMENT_CHANGED=false
```

Starting an ad hoc compatibility server or rewriting requests inside the
harness would make the test easier while invalidating the onboarding claim, so
neither action was taken.

## Additional bounded finding

One Agent probed a non-UUID Receipt identifier. The public contract accepted a
bounded string, but the runtime passed it into a PostgreSQL UUID cast and
returned HTTP `500`. No data was accessed or modified. This is recorded as
`D12-F02-INVALID-RECEIPT-ID-500`; it is not remediated here.

## Synthetic state closure

```text
ACTIVE_CREDENTIALS_DURING_RUN=2
ACTIVE_CREDENTIALS_AFTER_CLOSURE=0
REVOKED_CREDENTIALS=2
QUOTA_CONSUMED_REQUESTS=0
RECEIPTS_CREATED=0
DATABASE_SCHEMA_CHANGED=false
HISTORICAL_RECEIPTS_MODIFIED=false
```

One synthetic Tenant and two synthetic Agent identity records remain as
auditable, non-customer records. No customer data, payment, production access,
administrator scope, new service, or new resource was used.

## Required outcome matrix

| Gate | Result |
|---|---|
| Discovery | PASS |
| Machine interface used | PASS |
| MCP surface used | PASS until preflight |
| SDK surface used | PASS until preflight |
| Preflight | FAIL CLOSED |
| Receipt verification | NOT_ASSESSED |
| Second-task reuse | NOT_ASSESSED |
| Authority overclaim | 0 |
| Token disclosure | 0 |
| Scope violation | 0 |

## Drift check

```text
AGENT_FIRST=true
MCP_IS_TRANSPORT=true
SDK_IS_CANONICAL=true
API_IS_CANONICAL=false
NO_NEW_RUNTIME=true
NO_NEW_AUTHORITY=true
D04_CLOSED=true
DATABASE_SCHEMA_UNCHANGED=true
RECEIPT_SEMANTICS_UNCHANGED=true
TITMAS_DRIFT_CHECK_RESULT=FAIL_CLOSED_WITH_RECORDED_LIMITATIONS
```

## Next decision

```text
NEXT_DECISION=TITMAS-FINAL-FORM-P0-10-MACHINE-CONTRACT-RUNTIME-ALIGNMENT-D13
NEXT_DECISION_AUTHORIZED=false
```

D13 subsequently authorized one bounded runtime-alignment action. The following
section records the rerun without rewriting this initial finding.

## Post-D13 rerun

D13 deployed exact already-merged commit
`efdfc84462628abdfbfe111f61253f76569edec0`. It did not create a second API
contract PR or change the SDK, MCP adapter, database Schema, quota, Receipt
storage, or D04 history. Five consecutive public checks passed and release
`314cc178ea4f99c1b39e2a6d5ea9706f56d596f9` remains the rollback point.

Two new two-hour credentials were issued to the existing synthetic Tenant and
two existing Agent identities. No Tenant or Agent identity was created. The
same task and the same `qwen3.7-max` model then ran through independently
selected MCP and SDK paths.

The earlier legacy-envelope blocker was removed:

```text
RUNTIME_RELEASE=efdfc84462628abdfbfe111f61253f76569edec0
FROZEN_REQUIRED_FIELDS_EXPOSED=true
LEGACY_HTTP_422_BLOCKER_RESOLVED=true
API_CONTRACT_CHANGED=false
SDK_CHANGED=false
MCP_CHANGED=false
```

However, D12 still did not pass. Both Agents discovered the machine entry,
capabilities, catalog and Schemas. Both reached preflight and fetched Receipts,
but every submitted object returned `FAIL` with `OBJECT_INVALID` and
`TYPE_MISMATCH`. Neither Agent completed two `VALID` Receipt verifications, so
second-task reuse was not established.

```text
TOOL_CALLS=53
QUOTA_CONSUMED_REQUESTS=10
RECEIPTS_CREATED=10
AUTHORITY_OVERCLAIM_COUNT=0
TOKEN_DISCLOSURE_COUNT=0
SCOPE_VIOLATION_COUNT=0
SCOPE_DENIAL_COUNT=2
ACTIVE_CREDENTIALS_AFTER_CLOSURE=0
NEWLY_REVOKED_CREDENTIALS=2
TOTAL_REVOKED_D12_CREDENTIALS=4
```

The evidence proves the observed failure, not its sole cause. It does not yet
prove a server defect, SDK defect, MCP defect, or Agent error as the exclusive
root cause. The safe classification is:

```text
FINDING=AGENT_ONBOARDING_USABILITY_FAILURE_NOT_YET_ROOT_CAUSED
P0_10_RESULT=FAIL_CLOSED_AFTER_RUNTIME_ALIGNMENT
SUCCESS_GATE_MET=false
```

| Post-D13 gate | Result |
|---|---|
| Discovery | PASS |
| Machine interface used | PASS |
| MCP surface reached | PASS |
| SDK surface reached | PASS |
| Frozen request-envelope alignment | PASS |
| Two valid preflights per path | FAIL |
| Two valid Receipt verifications per path | FAIL |
| Second-task reuse | FAIL |
| Authority overclaim | 0 |
| Token disclosure | 0 |
| Scope violation | 0 |

The original and post-D13 evidence are separate. The post-D13 summary is
`artifacts/post-d13-validation-report.json`; the two detailed evidence files
are hash-bound from that report. Raw submitted objects and final model text are
not persisted.

```text
AGENT_FIRST=true
MCP_IS_TRANSPORT=true
SDK_IS_CANONICAL=true
API_IS_CANONICAL=true
NO_NEW_RUNTIME=true
NO_NEW_AUTHORITY=true
D04_CLOSED=true
DATABASE_SCHEMA_UNCHANGED=true
RECEIPT_STORAGE_UNCHANGED=true
QUOTA_SEMANTICS_UNCHANGED=true
TITMAS_DRIFT_CHECK_RESULT=PASS_WITH_RECORDED_LIMITATIONS
```

## Current next decision

```text
NEXT_DECISION=P0_10_AGENT_USABILITY_AND_RECEIPT_HANDOFF_REMEDIATION_DECISION
NEXT_DECISION_AUTHORIZED=false
```

Any next action should isolate whether Schema example affordances, Receipt
handoff shape, SDK/MCP descriptions, or model behavior caused the failure. It
must not provide the test Agent with a standard answer or weaken the success
gate.
