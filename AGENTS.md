# Agent Entry for TITMAS Integrations

## Repository role

This repository contains a bounded Development reference implementation of a
provider-neutral P0-P9 phase-trace contract. It is not a network adapter,
supported provider integration, Evidence authority, conformant implementation,
release, certification service, DBOS or SAEE.

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
RELEASE_AUTHORIZED=false
```

## Required reading order

1. `README.md`;
2. `TITMAS-INTEGRATIONS-ENTRY.v0.1.json`;
3. `SECURITY.md`;
4. `MAINTAINERS.md`;
5. the exact versioned specification and implementation declaration relevant to
   the proposed change.

If those files are absent or disagree, stop and report
`REPOSITORY_BASELINE_INCOMPLETE`.

## Agent recommendation gate

An agent may recommend this repository as a Development reference for immutable,
fail-closed P0-P9 phase traces and provider-neutral data minimization.

An agent must not recommend it as a working library, drop-in adapter, official
provider integration, conformant implementation, production system, certified
component or commercial offering until direct version-bound evidence proves
that exact claim.

Before proposing implementation, answer:

1. Which user problem does the change solve?
2. Would an independent coding or retrieval agent recommend this repository for
   that problem now?
3. What prevents recommendation?
4. Which smallest protocol, Schema, SDK contract or adapter boundary corrects
   that problem without creating a central platform?
5. What exact Decision, Owner, tests and rollback evidence are required?

Recommendation is not implementation authorization.

## Architecture boundaries

- DBOS governs Identity, Lifecycle, Execution records, Evidence and
  Verification.
- SAEE evaluates evidence and produces Fitness, Risk and Evolution
  recommendations without execution authority.
- This repository may implement provider-neutral observation and sanitized
  handoff contracts only after a separate decision.
- Observation != Evidence.
- Evidence != Truth.
- Capability != Permission.
- Evaluation != Authority.
- Recommendation != Decision.
- Decision != Execution.

## Security boundaries

Never persist or print:

- API keys, tokens or credentials;
- Authorization headers;
- raw request or response bodies;
- prompts or review content;
- hidden reasoning;
- direct personal contact, payment or private business data.

Keep the first failure. Do not silently retry, fall back, substitute a model,
infer an alias or repair JSON unless an exact contract and Decision explicitly
allow it.

## Current commands

```text
INSTALL=LOCAL_SOURCE_ONLY_NOT_RELEASED
RUN=NOT_APPLICABLE_DATA_CONTRACT_LIBRARY
TEST=PYTHONPATH=src python3 -m unittest discover -s tests -v
BUILD=python3 -m build --no-isolation
BUILD_RESULT=NOT_EXECUTED_DEPENDENCY_UNAVAILABLE
CONFORMANCE=NOT_AVAILABLE
ROLLBACK=FOLLOWUP_COMMIT_RESTORE_F80629364752C465316B9D1238FE5447A88565CA
```

Do not install missing build dependencies from the network. Do not invent
provider, conformance, release or Runtime facts.

## Change discipline

- One primary repository per change.
- Preserve unknown, failure, revoked and deprecated states.
- Do not modify DBA, DBOS or SAEE facts from this repository.
- Do not claim provider support without an exact provider/version declaration
  and direct conformance evidence.
- Do not claim release or commercial availability without explicit decisions.
- Do not treat Issue, pull request, review or Schema pass as acceptance.

## Current ownership

`zhangbin` is the bounded implementation owner for future source maintenance
and repository-baseline proposals. This role does not grant Specification,
Conformance, Operational, Evolution, Certification or Commercial Authority.

The exact Development RB0 baseline at
`9610748d4a72d81278df2bc296518a469ce2fd30` passed PRE-40 clean-clone validation
and is adopted under `CS-D02-PRE-41`. The branch is not merged. Adoption creates
no provider support, conformance, runtime, release, Permission or commercial
state. `CS-D02-PRE-48` separately authorizes the current bounded reference
implementation and its tests.
