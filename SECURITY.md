# Security Policy Candidate

## Current status

This repository has a Development data-contract reference implementation, but
no network executor, runtime, provider binding, supported or released version.
A formal security contact and private disclosure channel have not been assigned.

```text
SECURITY_CONTACT=NOT_ASSIGNED
PRIVATE_DISCLOSURE_CHANNEL=NOT_ASSIGNED
SUPPORTED_VERSIONS=NONE
SECURITY_REVIEW_EXECUTED=false
NETWORK_EXECUTION_IMPLEMENTED=false
PERSISTENCE_STORE_IMPLEMENTED=false
PROVIDER_BINDING_IMPLEMENTED=false
LOCAL_CONTRACT_REHEARSAL=PASS
```

Do not place secrets, credentials, tokens, Authorization headers, raw payloads,
prompts, review content, hidden reasoning, private business data or personal
contact/payment data in a public Issue, pull request, log or receipt.

Because no verified private disclosure channel exists yet, do not publish
exploit details or sensitive reproductions. Record only a non-sensitive notice
that a private channel is required and wait for an explicitly assigned route.

## Implemented safeguards

The current reference implementation:

- exposes no credential, Authorization, raw-body, prompt, review-content or
  hidden-reasoning fields;
- contains no network client or Provider SDK;
- preserves a single immutable first failure;
- validates P0-P9 order, predecessor linkage and failure closure;
- serializes only bounded sanitized metadata;
- has no persistence or retention scheduler;
- keeps Observation distinct from Evidence and Truth.

The independent-path validator additionally rejects unexpected fields,
manifest hash drift, path escape, duplicate case identifiers and first-failure
closure violations. It imports neither the target implementation nor a network
or Provider SDK.

## Safeguards required before any network binding

Any future implementation proposal must define and test:

- credential and Authorization-header non-persistence;
- raw request/response body, prompt, review content and hidden-reasoning
  non-persistence;
- TLS verification and exact endpoint allowlisting;
- explicit per-phase timeout and response-size limits;
- disabled retry/fallback/repair defaults;
- sanitized metadata-only logging;
- first-failure preservation;
- failure-retaining disable and rollback;
- provider-neutral core and replaceable binding separation.

Passing a Schema does not constitute a security review. A security report does
not create release, conformance, certification or commercial authorization.
The PRE-49 local contract rehearsal is not a penetration test, supply-chain
review, Provider conformance result or security approval.

The RB0 security boundary is applied under `CS-D02-PRE-38`; the bounded
reference implementation is authorized by `CS-D02-PRE-48`. The branch is not
merged, no security review has been executed, and no supported version,
provider binding, runtime or release exists. `CS-D02-PRE-49` adds only the
bounded local contract rehearsal.
