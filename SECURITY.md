# Security Policy Candidate

## Current status

This repository has no implementation, package, runtime, provider binding or
released version. A formal security contact and private disclosure channel have
not been assigned.

```text
SECURITY_CONTACT=NOT_ASSIGNED
PRIVATE_DISCLOSURE_CHANNEL=NOT_ASSIGNED
SUPPORTED_VERSIONS=NONE
SECURITY_REVIEW_EXECUTED=false
```

Do not place secrets, credentials, tokens, Authorization headers, raw payloads,
prompts, review content, hidden reasoning, private business data or personal
contact/payment data in a public Issue, pull request, log or receipt.

Because no verified private disclosure channel exists yet, do not publish
exploit details or sensitive reproductions. Record only a non-sensitive notice
that a private channel is required and wait for an explicitly assigned route.

## Required implementation safeguards

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

This RB0 security boundary is applied to `codex/rb0-governance-baseline` under
`CS-D02-PRE-38`. The branch is not merged, no security review has been executed,
and no supported version, package, implementation, runtime or release exists.
