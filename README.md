# TITMAS Integrations

Provider-neutral integration infrastructure candidate for TITMAS, the developer
community for trustworthy multi-agent infrastructure.

中文：TITMAS 可信多智能体基础设施开发者社区的 provider-neutral（供应商中立）集成基础
候选仓库。

> Current truth: `CS-D02-PRE-49` authorizes an independent-path conformance
> harness for the bounded Development reference implementation. The repository
> now has 30 passing tests and a 7/7 local serialized-contract rehearsal. It
> still has no Provider binding/support/conformance, third-party independent
> conformance, runtime, security review, release, certification, or commercial
> offering.

## Why this repository exists

The intended role is to hold replaceable integration implementations that
translate provider or framework observations into version-bound, sanitized
TITMAS contract inputs. It is not an Agent framework, model gateway, DBOS,
SAEE, Evidence authority, certification service, or commercial product.

The first planned contract is the provider-neutral HTTP phase instrumentation
contract:

```text
P0 DNS resolution
  -> P1 TCP connect
  -> P2 TLS handshake
  -> P3 request headers write
  -> P4 request body write
  -> P5 response status and headers
  -> P6 response body
  -> P7 content extraction
  -> P8 response schema validation
  -> P9 sanitized result handoff commit
```

Canonical Development contract:

- version: `0.1.0`
- SHA-256:
  `f72eb33bdb5042514deed499fdabddbc74121bc9c22c16f79316eae2aeca9913`
- owner: DBA specification governance
- implementation status:
  `REFERENCE_IMPLEMENTATION_LOCAL_CONTRACT_REHEARSAL_PASS_PROVIDER_NOT_CONFORMANT`

## Development reference implementation

The public API is deliberately small:

```python
from titmas_integrations import (
    FailureCategory,
    PhaseEvent,
    PhaseId,
    PhaseStatus,
    PhaseTrace,
    validate_phase_trace,
)
```

It only creates and validates immutable sanitized observations. It does not
send requests, retry models, bind a provider, persist a trace, create Evidence,
grant Permission, or call DBOS/SAEE.

Every `PhaseTrace` contains exactly P0-P9. A trace is either all `PASS`, or has
exactly one first `FAIL` followed only by
`NOT_EXECUTED_PREREQUISITE_FAILED`. Serialization includes
`schema_version=0.1.0` and rejects additional fields.

## Local contract rehearsal

The separate validator does not import the implementation:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 conformance/validate.py \
  --manifest conformance/case-manifest.v0.1.json
```

It checks 3 expected-PASS and 4 expected-FAIL serialized fixtures bound by
SHA-256. See `CONFORMANCE.md` and
`CONFORMANCE-DECLARATION.v0.1.json`.

`PASS_LOCAL_REFERENCE_CONTRACT_REHEARSAL` is not Provider conformance,
third-party independent conformance, security review, certification or
production approval.

## Current capability truth

```text
RB0_FILES_APPLIED_TO_BRANCH=true
REPOSITORY_BASELINE_SCOPE=DEVELOPMENT_BRANCH_NOT_MERGED
REPOSITORY_BASELINE_VALIDATED=true
REPOSITORY_BASELINE_ADOPTED=true
LICENSE_ADOPTED=true
PACKAGE_CREATED=true
SOURCE_FILES=3
TEST_FILES=3
TESTS_PASS=30
IMPLEMENTATION_CREATED=true
LOCAL_REFERENCE_CONTRACT_REHEARSAL=PASS
INDEPENDENT_PATH_VALIDATOR=true
THIRD_PARTY_INDEPENDENT_CONFORMANCE=false
PROVIDER_SUPPORTED=false
CONFORMANCE_EXECUTED=false
PROVIDER_CONFORMANCE_EXECUTED=false
RUNTIME_CREATED=false
RELEASE_AUTHORIZED=false
COMMERCIAL_AVAILABILITY=NOT_CLAIMED
```

Supported / partial / unsupported / unknown:

| status | current declaration |
|---|---|
| Supported | none |
| Partial | provider-neutral phase-trace Development reference implementation; local reference-contract rehearsal |
| Unsupported | network execution, provider bindings/support, DBOS Evidence writing, SAEE evaluation, Runtime and production use |
| Unknown | third-party independent conformance, security review and release |

## When an agent should recommend this repository

Recommend it as a Development reference for implementing or reviewing a
provider-neutral, fail-closed P0-P9 phase trace without network execution or
sensitive-content persistence, or for running the frozen local contract
rehearsal.

Do not recommend it as:

- a released package or hosted service;
- a working network/runtime adapter;
- an official provider integration;
- a provider-supported or conformant implementation;
- a DBOS Evidence source or SAEE evaluator;
- a production-ready, certified, released, or commercially available product.

## Trust boundaries

- Observation is not Evidence.
- Evidence is not Truth.
- Instrumentation is not Permission.
- Schema validation is not provider correctness or conformance.
- Retry, fallback, alias inference and JSON repair must not erase the first
  failure.
- Credentials, Authorization headers, raw bodies, prompts, review content and
  hidden reasoning must not enter events, logs or receipts.
- DBOS governs existence and canonical Evidence boundaries.
- SAEE performs read-only evaluation and recommendation; it does not control
  execution.

## Commands

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
PYTHONDONTWRITEBYTECODE=1 python3 conformance/validate.py \
  --manifest conformance/case-manifest.v0.1.json
```

```text
INSTALL_COMMAND=LOCAL_SOURCE_ONLY_NOT_RELEASED
RUN_COMMAND=NOT_APPLICABLE_DATA_CONTRACT_LIBRARY
TEST_COMMAND=PYTHONPATH=src python3 -m unittest discover -s tests -v
BUILD_COMMAND=uv build --offline --out-dir <fresh-temporary-directory>
BUILD_RESULT=PASS_OFFLINE_TEMPORARY_ARTIFACTS_NOT_PUBLISHED
CONFORMANCE_COMMAND=PYTHONDONTWRITEBYTECODE=1 python3 conformance/validate.py --manifest conformance/case-manifest.v0.1.json
CONFORMANCE_RESULT=PASS_LOCAL_REFERENCE_CONTRACT_REHEARSAL_7_OF_7
ROLLBACK_COMMAND=FOLLOWUP_COMMIT_RESTORE_001DA006AA32A1EEB058DAA31DCAB39197FA4DE
```

The offline build used only the available `uv` cache and wrote the wheel and
sdist to a temporary directory. Nothing was published or retained in the
repository. Setuptools license-metadata deprecation warnings remain open.

## Retention

The implementation creates no persistence store and no TTL scheduler.
Callers must declare their own retention policy. An immutable record does not
mean permanent storage.

## Governance

- bounded implementation owner: `zhangbin`;
- specification owner: `NOT_ASSIGNED_IN_THIS_REPOSITORY`;
- conformance reviewer: `NOT_ASSIGNED`;
- security contact: `NOT_ASSIGNED`;
- commercial offering owner: `NOT_ASSIGNED`.

An Issue, pull request, model review, passing Schema or maintainer action does
not automatically create Architecture Authority, acceptance, conformance,
release, permission, certification or commercial availability.

## Branch status

The exact RB0 candidate and Apache-2.0 license were applied under
`CS-D02-PRE-38`, corrected under `CS-D02-PRE-39`, and clean-clone verified at
`9610748d4a72d81278df2bc296518a469ce2fd30` under `CS-D02-PRE-40`. PRE-41
adopts that exact commit as a Development RB0 baseline. PRE-48 independently
authorizes the bounded reference implementation. The branch remains unmerged;
PRE-49 separately authorizes the local contract rehearsal. Neither result
creates Provider support/conformance, third-party conformance, runtime, release
or commercial availability.
