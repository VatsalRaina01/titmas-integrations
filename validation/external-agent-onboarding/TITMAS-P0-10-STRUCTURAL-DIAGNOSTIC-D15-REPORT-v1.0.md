# TITMAS P0-10 Privacy-Preserving Structural Diagnostic D15 Final v1.1

## Decision and boundary

```text
DECISION_ID=TITMAS-P0-10-PRIVACY-PRESERVING-STRUCTURAL-DIAGNOSTIC-D15
DECIDED_BY_REF=zhangbin
ANALYSIS_ONLY=true
D15_IS_FINAL_DIAGNOSTIC=true
NEW_FEATURE=false
PR_NUMBER=5
PR_STATE=OPEN_DRAFT
PR_HEAD_BEFORE=a9a6dd7cb196e00960f287ffe1e71f400e1c6610
PR_HEAD_AFTER_REFERENCE=THIS_EXISTING_PR_UPDATE_COMMIT
MCP_SESSION_EXECUTED=true
SDK_SESSION_EXECUTED=true
```

D15 used two independent synthetic Agent sessions, one MCP path and one SDK path. It did not supply a correct object, field location, expected type, hidden fixture, tool order, or Receipt wrapper. It did not modify the frozen API, Schema, reason-code registry, Gateway, SDK, MCP Adapter, database, D04 history, deployment, Release, or package publication.

Both sessions reached their bounded model-round limit without a final Agent response. The first MCP process retained no diagnostic trace after its fail-closed termination, so its preflight count is recorded conservatively at the per-session upper bound. The SDK session retained one preflight attempt but no Receipt handoff. These limitations prohibit a cross-path root-cause claim.

## Frozen baseline

```text
GATEWAY_RUNTIME_RELEASE=efdfc84462628abdfbfe111f61253f76569edec0
LIVE_RUNTIME_CONTRACT=FROZEN_API_V1
SDK_CONTRACT_MATCH=true
MCP_CONTRACT_MATCH=true
```

## Track A — object construction

```text
OBJECT_CONSTRUCTION_ROOT_CAUSE=MULTI_LAYER_OR_NOT_ASSESSED
OBJECT_CONSTRUCTION_CONFIDENCE=0.58
OBJECT_AFFECTED_LAYER=NOT_ASSESSED
GATEWAY_LOCAL_VALIDATOR_AGREE=NOT_ASSESSED
```

Supporting observations:

- `attempt_count=1`
- `locally_invalid_before_mapping=0`
- `mapped_object_unchanged=1`
- `gateway_local_result_agreement=0`

The local validator was an explanatory, read-only copy of the public Schema. It was not the canonical Gateway and created no adjudication authority.

## Track B — Receipt handoff

```text
RECEIPT_HANDOFF_ROOT_CAUSE=RECEIPT_HANDOFF_NOT_ASSESSED
RECEIPT_HANDOFF_CONFIDENCE=0.55
RECEIPT_AFFECTED_LAYER=NOT_ASSESSED
```

Supporting observations:

- `handoff_count=0`
- `agent_nested_receipt_match=0`
- `fetched_to_wire_receipt_mismatch=0`
- `wire_verify_contract_valid=0`
- `wire_verify_contract_invalid=0`

A FAIL Receipt remained independently eligible for structural and cryptographic diagnosis. Receipt fetch was not treated as Receipt verification, and object failure was not assumed to cause Receipt failure.

## Current repair feedback

```text
FIELD_LOCALIZATION_AVAILABLE=false
EXPECTED_TYPE_AVAILABLE=false
MISSING_REQUIRED_FIELD_AVAILABLE=false
MACHINE_READABLE_REPAIR_ACTION_AVAILABLE=false
CURRENT_REPAIR_FEEDBACK_SUFFICIENT=NOT_ASSESSED
```

## Privacy and credential closure

```text
RAW_OBJECT_FINDINGS=0
RAW_RECEIPT_FINDINGS=0
TOKEN_FINDINGS=0
AUTHORIZATION_HEADER_FINDINGS=0
IDENTITY_DISCLOSURE_FINDINGS=0
ALLOWLIST_BASED_DIAGNOSTIC_SERIALIZATION=true
DIAGNOSTIC_JSON_SCHEMA_VALIDATION=true
ALL_D15_CREDENTIALS_REVOKED=true
ACTIVE_D15_CREDENTIALS=0
REVOKED_CREDENTIAL_HTTP_401_VERIFIED=true
```

## Retained outcome and disposition

```text
D15_STATUS=BLOCKED_OR_NOT_ASSESSED
D12_FAILURE_RETAINED=true
P0_10_RESULT=FAIL_CLOSED_AFTER_RUNTIME_ALIGNMENT
ONE_LAYER_ONLY=false
COMPETING_LAYERS_EXCLUDED=false
NEXT_HUMAN_DECISION=NOT_ASSESSED_DIAGNOSTIC_LIMIT_REACHED
```

D15 is diagnostic evidence, not a remediation or PASS claim. If the two tracks retain different affected layers, or any competing layer remains plausible, the bounded route terminates at `NOT_ASSESSED_DIAGNOSTIC_LIMIT_REACHED`.

## Drift check

```text
AGENT_ABSOLUTE_PRIORITY=true
D15_NE_FEATURE_DEVELOPMENT=true
D15_NE_PRODUCT_REMEDIATION=true
AGGREGATE_REASON_CODE_NE_ROOT_CAUSE=true
PRIVACY_NE_DIAGNOSTIC_BLINDNESS=true
STRUCTURAL_DIAGNOSTIC_NE_RAW_VALUE_RETENTION=true
RECEIPT_FETCH_NE_RECEIPT_VERIFY=true
FAIL_RECEIPT_NE_UNVERIFIABLE_RECEIPT=true
OBJECT_FAILURE_NE_RECEIPT_FAILURE_ASSUMED=true
D12_FAILURE_RETAINED=true
P0_10_PASS_FABRICATED=false
NO_NEW_PR=true
NO_NEW_FEATURE=true
NO_PORTFOLIO_EXPANSION=true
NO_D04_REOPEN=true
NO_DEPLOYMENT=true
TITMAS_DRIFT_CHECK_RESULT=PASS_WITH_RECORDED_LIMITATIONS
```
