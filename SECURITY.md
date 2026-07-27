# Security Policy Candidate

## Current status

This repository has a Development data-contract reference implementation and a
bounded POSIX P0 resolver reference. The public P0 function is network-capable
when called, but PRE-67 validation used injected fakes and executed no real DNS,
TCP, TLS or HTTP. There is no P1/P2 executor, runtime, Provider binding,
supported or released version. A formal security contact and private disclosure
channel have not been assigned.

```text
SECURITY_CONTACT=NOT_ASSIGNED
PRIVATE_DISCLOSURE_CHANNEL=NOT_ASSIGNED
SUPPORTED_VERSIONS=NONE
SECURITY_REVIEW_EXECUTED=false
BOUNDED_DNS_CAPABILITY_IMPLEMENTED=true
REAL_DNS_CALLS_DURING_VALIDATION=0
P1_TCP_IMPLEMENTED=false
P2_TLS_IMPLEMENTED=false
TOTAL_WALL_CLOCK_UPPER_BOUND_CLAIM=false
CROSS_PLATFORM_SUPPORT_CLAIM=false
MULTITHREADED_FORK_SAFETY_ESTABLISHED=false
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
- contains no HTTP client or Provider SDK;
- preserves a single immutable first failure;
- validates P0-P9 order, predecessor linkage and failure closure;
- serializes only bounded sanitized metadata;
- has no persistence or retention scheduler;
- keeps Observation distinct from Evidence and Truth.

The PRE-67 P0 boundary additionally:

- rejects non-canonical hostnames, IP literals and names outside the exact
  immutable allowlist before child creation;
- performs at most one fixed `getaddrinfo` call in a single-use POSIX child;
- closes every inherited file descriptor except the bounded result pipe;
- clears the child environment mapping before the resolver call;
- admits success only before a 5000 ms monotonic deadline;
- terminates and waits for a late child before returning;
- accepts at most 512 bytes and one numeric sockaddr over a local pipe;
- rejects hostname, exception and credential markers in child output;
- binds a versioned IANA IPv4/IPv6 snapshot by byte count and SHA-256;
- applies most-specific-prefix destination policy and no fallback;
- keeps `EndpointBinding` transient, immutable, redacted and non-pickleable;
- validates P0/P1 address and P2 hostname continuity without connecting.

Process creation and post-termination wait are not claimed to have an absolute
total wall-clock bound. The code requires POSIX `fork`/`waitpid`; only
Darwin-arm64 with CPython 3.14.5 was directly observed in PRE-67 local
validation. It rejects more than one active Python thread before `fork`, but
native-thread and extension safety is not established. Linux, Windows, mobile
and WebAssembly support are not established.

The independent-path validator additionally rejects unexpected fields,
manifest hash drift, path escape, duplicate case identifiers and first-failure
closure violations. It imports neither the target implementation nor a network
or Provider SDK.

## Safeguards required before P1/P2 or Provider binding

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
bounded local contract rehearsal. `CS-D02-PRE-67` adds only the bounded POSIX P0
resolver reference and offline fake-resolver tests. It is not a formal human
security review, penetration test, real-network result, cross-platform claim or
production approval.
