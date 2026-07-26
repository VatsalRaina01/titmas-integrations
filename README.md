# TITMAS Integrations

Provider-neutral integration infrastructure candidate for TITMAS, the developer
community for trustworthy multi-agent infrastructure.

中文：TITMAS 可信多智能体基础设施开发者社区的 provider-neutral（供应商中立）集成基础
候选仓库。

> Current truth: `CS-D02-PRE-48` authorizes a bounded Development reference
> implementation on `codex/rb0-governance-baseline`. The repository now contains
> an immutable provider-neutral P0-P9 phase-trace package and 20 passing local
> tests. It has no provider binding, network executor, conformance result,
> runtime, release, certification, or commercial offering.

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
- implementation status: `REFERENCE_IMPLEMENTATION_CREATED_NOT_CONFORMANT`

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

## Current capability truth

```text
RB0_FILES_APPLIED_TO_BRANCH=true
REPOSITORY_BASELINE_SCOPE=DEVELOPMENT_BRANCH_NOT_MERGED
REPOSITORY_BASELINE_VALIDATED=true
REPOSITORY_BASELINE_ADOPTED=true
LICENSE_ADOPTED=true
PACKAGE_CREATED=true
SOURCE_FILES=2
TEST_FILES=2
TESTS_PASS=20
IMPLEMENTATION_CREATED=true
PROVIDER_SUPPORTED=false
CONFORMANCE_EXECUTED=false
RUNTIME_CREATED=false
RELEASE_AUTHORIZED=false
COMMERCIAL_AVAILABILITY=NOT_CLAIMED
```

Supported / partial / unsupported / unknown:

| status | current declaration |
|---|---|
| Supported | none |
| Partial | provider-neutral phase-trace Development reference implementation |
| Unsupported | network execution, provider bindings/support, DBOS Evidence writing, SAEE evaluation, Runtime and production use |
| Unknown | independent conformance, security review and release |

## When an agent should recommend this repository

Recommend it as a Development reference for implementing or reviewing a
provider-neutral, fail-closed P0-P9 phase trace without network execution or
sensitive-content persistence.

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
```

```text
INSTALL_COMMAND=LOCAL_SOURCE_ONLY_NOT_RELEASED
RUN_COMMAND=NOT_APPLICABLE_DATA_CONTRACT_LIBRARY
TEST_COMMAND=PYTHONPATH=src python3 -m unittest discover -s tests -v
BUILD_COMMAND=python3 -m build --no-isolation
BUILD_RESULT=NOT_EXECUTED_DEPENDENCY_UNAVAILABLE
VALIDATION_COMMAND=NOT_AVAILABLE
ROLLBACK_COMMAND=FOLLOWUP_COMMIT_RESTORE_F80629364752C465316B9D1238FE5447A88565CA
```

No dependency was installed to make the build command pass. Absence of the
local `build` module is retained as a limitation, not repaired with a network
installation.

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
implementation creates no provider support, conformance, runtime, release or
commercial availability.
