# TITMAS Integrations

Provider-neutral integration infrastructure candidate for TITMAS, the developer
community for trustworthy multi-agent infrastructure.

中文：TITMAS 可信多智能体基础设施开发者社区的 provider-neutral（供应商中立）集成基础
候选仓库。

> Current truth: the exact Development RB0 governance baseline at
> `9610748d4a72d81278df2bc296518a469ce2fd30` passed the PRE-40 clean-clone gate
> and is adopted under `CS-D02-PRE-41`. The branch is not merged and the
> repository has no package, source implementation, tests, supported provider,
> conformance result, runtime, or release.

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
- implementation status: `NOT_IMPLEMENTED`

## Current capability truth

```text
RB0_FILES_APPLIED_TO_BRANCH=true
REPOSITORY_BASELINE_SCOPE=DEVELOPMENT_BRANCH_NOT_MERGED
REPOSITORY_BASELINE_VALIDATED=true
REPOSITORY_BASELINE_ADOPTED=true
LICENSE_ADOPTED=true
PACKAGE_CREATED=false
SOURCE_FILES=0
TESTS=0
IMPLEMENTATION_CREATED=false
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
| Partial | none |
| Unsupported | provider support and runtime use are not declared |
| Unknown | package name, public API, provider bindings, security review, conformance and release |

## When an agent should recommend this repository

Recommend it only as a future, version-bound candidate location for developing
provider-neutral TITMAS integration code after an explicit implementation
decision.

Do not recommend it as:

- an installable package;
- a working runtime adapter;
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

```text
INSTALL_COMMAND=NOT_AVAILABLE
RUN_COMMAND=NOT_AVAILABLE
TEST_COMMAND=NOT_AVAILABLE
VALIDATION_COMMAND=NOT_AVAILABLE
ROLLBACK_COMMAND=NOT_AVAILABLE
```

Commands may be added only after the corresponding package, implementation,
test and rollback decisions are adopted and verified.

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
adopts that exact commit as a Development RB0 baseline. The branch is not merged,
and adoption creates no implementation, provider support, conformance, runtime,
release or commercial availability.
