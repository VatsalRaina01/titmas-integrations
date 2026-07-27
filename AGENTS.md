# Agent Entry for TITMAS Integrations

## Repository role

This repository contains a bounded Development reference implementation of a
provider-neutral P0-P9 phase-trace contract, a POSIX P0 resolver boundary and an
independent-path local contract rehearsal. The P0 API is network-capable if an
authorized caller invokes it, but PRE-67 validation used only injected fakes.
This is not a complete network adapter, supported Provider integration,
Provider-conformant implementation, third-party certification, release, DBOS or
SAEE.

```text
RB0_FILES_APPLIED_TO_BRANCH=true
REPOSITORY_BASELINE_SCOPE=DEVELOPMENT_BRANCH_NOT_MERGED
REPOSITORY_BASELINE_VALIDATED=true
REPOSITORY_BASELINE_ADOPTED=true
LICENSE_ADOPTED=true
PACKAGE_CREATED=true
SOURCE_FILES=6
TEST_FILES=6
TESTS_PASS=92
IMPLEMENTATION_CREATED=true
LOCAL_REFERENCE_CONTRACT_REHEARSAL=PASS
P0_RESOLVER_REFERENCE_IMPLEMENTATION_CREATED=true
BOUNDED_DNS_CAPABILITY_IMPLEMENTED=true
REAL_DNS_CALLS_DURING_VALIDATION=0
P1_TCP_IMPLEMENTED=false
P2_TLS_IMPLEMENTED=false
TOTAL_WALL_CLOCK_UPPER_BOUND_CLAIM=false
CROSS_PLATFORM_SUPPORT_CLAIM=false
MULTITHREADED_FORK_SAFETY_ESTABLISHED=false
THIRD_PARTY_INDEPENDENT_CONFORMANCE=false
PROVIDER_SUPPORTED=false
CONFORMANCE_EXECUTED=false
RELEASE_AUTHORIZED=false
```

## Required reading order

1. `README.md`;
2. `TITMAS-INTEGRATIONS-ENTRY.v0.1.json`;
3. `SECURITY.md`;
4. `CONFORMANCE.md`;
5. `CONFORMANCE-DECLARATION.v0.1.json`;
6. `MAINTAINERS.md`;
7. the exact versioned specification and implementation declaration relevant to
   the proposed change.

If those files are absent or disagree, stop and report
`REPOSITORY_BASELINE_INCOMPLETE`.

## Agent recommendation gate

An agent may recommend this repository as a Development reference for immutable,
fail-closed P0-P9 phase traces and provider-neutral data minimization.
It may also recommend the frozen local contract rehearsal when the user needs
an independent-path serialized-fixture check.
It may recommend the PRE-67 P0 implementation as a POSIX Development reference
for exact-hostname allowlisting, single-use child resolution, frozen
destination-policy checks and offline endpoint-continuity validation only when
it also discloses that real DNS/network validation and formal security review
are absent.

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
- Resolver capability != Permission to resolve.
- EndpointBinding != Evidence or Truth.

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

The P0 public function may call the OS resolver. Never call it during a task
unless that task separately authorizes real DNS/network execution. Tests must
use `_resolve_endpoint_with_worker` with fork-safe fakes and must not import or
call the public `resolve_endpoint`. More than one active Python thread must fail
closed; the child must retain only its bounded result pipe and clear its
environment. Native-thread and extension safety remain unestablished.

## Current commands

```text
INSTALL=LOCAL_SOURCE_ONLY_NOT_RELEASED
RUN=NOT_APPLICABLE_DATA_CONTRACT_LIBRARY
TEST=PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -m unittest discover -s tests -v
BUILD=uv build --offline --out-dir <fresh-temporary-directory>
BUILD_RESULT=PASS_OFFLINE_TEMPORARY_ARTIFACTS_NOT_PUBLISHED
CONFORMANCE=PYTHONDONTWRITEBYTECODE=1 python3 conformance/validate.py --manifest conformance/case-manifest.v0.1.json
CONFORMANCE_RESULT=PASS_LOCAL_REFERENCE_CONTRACT_REHEARSAL_7_OF_7
ROLLBACK=FOLLOWUP_COMMIT_RESTORE_5AC891C5AF88B1E9AEACDB3666217C6F832A57A6
```

Do not install missing build dependencies from the network. Do not promote the
local rehearsal to Provider conformance, third-party independence, release or
Runtime facts.

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
`CS-D02-PRE-49` separately authorizes the independent-path local contract
rehearsal; it creates no Provider or third-party conformance claim.
`CS-D02-PRE-67` separately authorizes the POSIX P0 resolver Development
reference and offline tests. It creates no P1/P2 implementation, Provider
support, cross-platform claim, formal security approval, Runtime or release.
