# Agent entry

This public repository contains source candidates for TITMAS SDKs and bounded
Agent-framework adapters. It does not contain the private TITMAS core.

Before changing a client or adapter:

1. read `README.md`, `agent-entry.json`, `integration-manifest.json`, and
   `PRE-DEVELOPMENT-AGENT-RECOMMENDATION-v0.1.md`;
2. identify one primary integration surface;
3. preserve `PASS`, `FAIL`, and `NOT_ASSESSED` exactly;
4. fail closed if a service response elevates formal Conformance,
   Certification, Truth, Authorization, or Permission;
5. never silently retry POST or another non-idempotent operation;
6. keep credentials, customer data, private repository locations, and provider
   keys out of source, fixtures, logs, and model prompts;
7. run all affected package tests plus the aggregate validation workflow.

SDK generation rules:

- `openapi/titmas-api-v1.yaml` is the exact frozen generation input;
- `titmas-python-sdk/generated/` and `titmas-typescript-sdk/generated/` are
  mechanical OpenAPI Generator output and must not be hand-edited;
- regenerate only with `scripts/generate-sdks.sh` and the pinned
  `sdk-generation.lock.json`;
- semantic code in each `src/` directory may wrap generated API classes but
  must not implement HTTP, retries or a second transport client.

Permanent boundaries:

```text
SCHEMA_PREFLIGHT_NE_FORMAL_CONFORMANCE=true
RECEIPT_NE_TRUTH=true
VERIFICATION_NE_AUTHORIZATION=true
PLAN_NE_AUTHORITY=true
SDK_NE_AGENT_RUNTIME=true
PUBLIC_INTERFACE_NE_PUBLIC_CORE_SOURCE=true
PACKAGE_SOURCE_NE_PACKAGE_PUBLICATION=true
```

The observed OpenAPI snapshot is review material, not a second live API truth
source. Its manifest must distinguish the service-reported version from the
retained deployment release.
