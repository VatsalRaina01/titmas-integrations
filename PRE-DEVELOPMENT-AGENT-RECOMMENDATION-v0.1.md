# TITMAS Integration Contract Hardening Recommendation v0.1

## Question

If a potential AI-agent customer needs a bounded client for the TITMAS
commercial candidate, should an Agent recommend the current integration source?

## Independent advisory result

`qwen3.7-max` reviewed sanitized source and test facts on `2026-07-31`:

```text
AGENT_RECOMMENDATION=CONDITIONALLY_RECOMMENDED
PACKAGE_PUBLICATION_RECOMMENDED=false
HUMAN_RELEASE_DECISION_STILL_REQUIRED=true
```

## Non-recommendation reasons

- permanent authority-boundary booleans were not checked at runtime;
- Python and TypeScript could pass through or mask a malformed response;
- no reviewed OpenAPI snapshot or digest existed;
- aggregate pytest collection failed because two adapters used the same test
  module name;
- root lint found two import-order defects;
- packages were not published;
- the live OpenAPI reported service version `6962da0…`, while the retained live
  release was `9bbfce6…`; those identities must not be conflated.

## Authorized remediation scope

- add runtime fail-closed boundary validation;
- add negative tests;
- add an observed OpenAPI snapshot and provenance manifest;
- repair aggregate testing and lint;
- improve Agent-readable entry and known-limitations metadata.

## Stop conditions

- any true or missing permanent non-authority field is accepted;
- `NOT_ASSESSED` is converted to `FAIL`;
- a Receipt is described as Truth, Certification, or Authorization;
- POST is silently retried;
- reported service version is represented as retained release identity;
- packages, production support, or public credentials are activated.

The recommendation is advisory. It creates no package publication, Release,
Credential, Permission, commercial access, or production authority.
