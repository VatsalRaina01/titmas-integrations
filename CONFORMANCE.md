# TITMAS Integrations Conformance Boundary

This repository contains a Development, independent-path conformance harness
for the serialized P0-P9 phase-trace contract.

中文：本仓库提供 Development（开发阶段）的 P0-P9 序列化契约独立路径验证工具。

## Run

```bash
PYTHONDONTWRITEBYTECODE=1 python3 conformance/validate.py \
  --manifest conformance/case-manifest.v0.1.json
```

Expected result:

```text
status=PASS
case_count=7
matched_count=7
```

The corpus contains 3 expected-PASS and 4 expected-FAIL fixtures. Each fixture
is bound by SHA-256 in `conformance/case-manifest.v0.1.json`. The validator
does not normalize, repair, or rewrite a fixture.

## What PASS means

`PASS_LOCAL_REFERENCE_CONTRACT_REHEARSAL` means:

- the manifest hashes match;
- the independent-path validator observes the frozen expected result for all
  seven serialized fixtures;
- the local reference implementation can serialize a success trace that this
  separate validator accepts;
- the validator uses the Python standard library and does not import
  `titmas_integrations`.

It does not mean:

- third-party independent conformance;
- Provider support, correctness, integration, or runtime behavior;
- DBOS Evidence admission or SAEE evaluation;
- security review, certification, production readiness, release, or commercial
  availability.

## Validator authority

The validator returns a deterministic local result and process exit code. Its
output is not Evidence, Truth, Permission, Authorization, a governance
Decision, or a command.

```text
OBSERVATION_NE_EVIDENCE=true
EVIDENCE_NE_TRUTH=true
VALIDATOR_RESULT_NE_AUTHORITY=true
LOCAL_REHEARSAL_NE_PROVIDER_CONFORMANCE=true
CONFORMANCE_PASS_NE_CERTIFICATION=true
```

## Build smoke

The PRE-49 build smoke uses:

```text
uv build --offline --out-dir <fresh-temporary-directory>
```

It completed from the available offline cache and created an sdist and wheel in
a temporary directory. Neither artifact is published or copied into this
repository. Setuptools emitted license-metadata deprecation warnings; these are
retained as a future packaging-maintenance input and are not a build failure.

Build success does not authorize installation guidance, registry publication,
GitHub Release, tag, merge, or production use.

## Retention

The validator has no persistence store and writes no result history. Callers
must explicitly govern any retained report. Immutability of fixture input does
not mean permanent storage.
