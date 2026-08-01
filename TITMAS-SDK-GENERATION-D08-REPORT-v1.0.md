# TITMAS Final Form P0 SDK Generation D08 Report v1.0

## Decision and scope

```text
DECISION_ID=TITMAS-FINAL-FORM-P0-SDK-GENERATION-D08
DECISION=AUTHORIZE_OPENAPI_GENERATED_SDK_IMPLEMENTATION
DECIDED_BY_REF=zhangbin
PRIMARY_REPOSITORY=joy7758/titmas-integrations
MAX_IMPLEMENTATION_PRS=1
```

The public integration repository owns developer-facing SDK source. The private
Gateway continues to own the frozen API contract and runtime implementation.
No second SDK implementation is added to the Gateway.

## Frozen input and generator

```text
SOURCE=openapi/titmas-api-v1.yaml
SOURCE_SHA256=4a56b4b4e1c841f8349ac9e79df82fd610467e7c1c1406e428cd251d5932eaf0
API_CONTRACT_MERGE=efdfc84462628abdfbfe111f61253f76569edec0
GENERATOR=OpenAPI Generator
GENERATOR_VERSION=7.24.0
GENERATOR_JAR_SHA256=4b83ccc6fd43056c8c631cd0195e5100bd0550912502527bab09ac76152dab0c
```

`sdk-generation.lock.json` binds the source, generator and outputs.
`scripts/generate-sdks.sh` verifies both hashes before writing generated code.
It also applies one locked, fail-closed compatibility correction for the six
invalid Python validators that Generator 7.24.0 emits for OAS 3.1
`const: false`; the source contract remains byte-identical.
Generated template whitespace is normalized deterministically as a second
locked formatting-only post-process.

## Outputs

- `titmas-python-sdk/generated/`: generated `python-httpx` transport and models;
- `titmas-python-sdk/src/`: TITMAS semantic wrapper;
- `titmas-python-sdk/examples/` and `tests/`;
- `titmas-typescript-sdk/generated/`: generated `typescript-fetch` transport and models;
- `titmas-typescript-sdk/src/`: TITMAS semantic wrapper;
- `titmas-typescript-sdk/examples/` and `tests/`.

`sdk/python` and `sdk/typescript` are compatibility symlinks only. They point to
the generated SDK source and do not retain a second handwritten transport.

## Contract behavior

- generated transport performs API calls;
- semantic wrappers do not call `httpx`, `fetch`, Axios or another transport;
- protected POST operations have no SDK retry loop;
- `PASS`, `FAIL` and `NOT_ASSESSED` remain distinct;
- Receipt verification projects `truth_verified=false` and
  `authorization_effect=false`;
- missing credential identity or required frozen fields fail closed.
- the exported negative fixture manifest is checked against the frozen
  contract and cannot elevate Authority or alter storage and quota semantics.

## Known limitations

- some frozen responses are intentionally generic and therefore generate
  `Any` or `unknown` return types;
- OpenAPI Generator reports OpenAPI 3.1 support as beta;
- existing MCP, LangChain and OpenAI Agents mappings do not yet provide every
  newly frozen preflight field and remain blocked for runtime use;
- neither package is published and no credential is provisioned.

## Validation

```text
PYTHON_TESTS=6_PASS
PYTHON_AGGREGATE_TESTS=8_PASS
PYTHON_RUFF=PASS
PYTHON_MYPY=PASS
TYPESCRIPT_TESTS=7_PASS
TYPESCRIPT_BUILD=PASS
MCP_COMPATIBILITY_BUILD=PASS
OPENAPI_VALIDATION=PASS_WITH_UNUSED_AUTHORITY_BOUNDARIES_RECOMMENDATION
NEGATIVE_FIXTURE_ALIGNMENT=PASS
GENERATION_PROVENANCE=PASS
DETERMINISTIC_REGENERATION=PASS
GENERATED_TRANSPORT_POST_ONCE=PASS
FULL_TEST_PASS=true
SDK_CONTRACT_TESTS=true
SECRET_SCAN_PASS=true
PACKAGE_PUBLICATION=false
DEPLOYMENT=false
```

## Non-effects

```text
API_CONTRACT_CHANGED=false
DATABASE_CHANGED=false
RECEIPT_STORAGE_CHANGED=false
QUOTA_CHANGED=false
D04_MODIFIED=false
OTEL_ENABLED=false
MCP_IMPLEMENTED=false
NEW_SERVICE_CREATED=false
NEW_PROVIDER_CREATED=false
NEW_RESOURCE_CREATED=false
PAYMENT=false
CUSTOMER_DATA=false
```

This report is implementation evidence, not Release, package publication,
production readiness, Conformance, Certification, Truth or Authorization.
