# TITMAS MCP Adapter D10 Agent Recommendation v1.0

## Gate question

If an MCP-compatible AI-agent customer needs bounded TITMAS discovery,
preflight, Receipt verification, usage and quota tools, should an Agent
recommend the current MCP candidate?

## Pre-development advisory

`qwen3.7-max` reviewed the frozen API/SDK facts and old MCP candidate on
2026-08-01. Its raw recommendation label was `FAIL`, interpreted within the
repository's recommendation vocabulary as:

```text
AGENT_RECOMMENDATION_CURRENT_OLD_CANDIDATE=NOT_RECOMMENDED
WOULD_RECOMMEND_TO_CUSTOMER=false
ADVISORY_AUTHORITY_EFFECT=false
```

The model identified the same material blockers as the repository:

- missing `credential_id`, `schema_version`, and `object_digest` mapping;
- delegated credential, Tenant, Agent, and credential ID must come only from
  process environment and cannot be overridden through tool arguments;
- SDK errors require stable, redacted MCP mapping;
- preflight, Receipt, Verification, Authority, and Truth semantics must remain
  separated;
- the adapter must not introduce direct HTTP, retries, or Gateway coupling.

It recommended the minimum tool set `capabilities`, `status`, `catalog`,
`preflight`, `get_receipt`, `verify_receipt`, `usage`, and `quota`, with
official in-memory MCP contract tests.

## Remediation contract

D10 may become recommendable only if:

1. all frozen API v1 request fields map exactly once into the TITMAS SDK;
2. protected tools fail closed when delegated context is incomplete;
3. strict MCP schemas reject outer credential and identity injection;
4. `PASS`, `FAIL`, and `NOT_ASSESSED` remain unchanged in SDK results;
5. unknown SDK failures expose neither raw exception text nor internal URLs;
6. source scans find no adapter HTTP client, retry path, secret, or private
   Gateway coupling;
7. official MCP client/server contract tests pass.

The frozen preflight response does not contain `object_digest`; therefore D10
can require and map it as an input but cannot add it to the response without an
unauthorized API contract change. This is a disclosed advisory limitation, not
a reason to modify the frozen contract.

The advisory result is not adoption, Authority, Certification, Release,
Deployment, or production support. A post-implementation advisory review is
required before the final D10 disposition.

## Post-implementation advisory

After the bounded implementation and local evidence were available, a separate
`qwen3.7-max` session returned:

```text
AGENT_RECOMMENDATION=RECOMMENDED
WOULD_RECOMMEND_TO_CUSTOMER=true
BLOCKING_FINDINGS=0
ADVISORY_AUTHORITY_EFFECT=false
```

The review recognized SDK-only delegation, strict schemas, environment-only
delegated context, redacted errors, exact field mapping, non-authority Receipt
semantics, 9/9 MCP tests, 7/7 TypeScript SDK tests, and zero MCP npm audit
findings. It retained two non-blocking limitations: callers must retain the
preflight `object_digest` because the frozen response does not repeat it, and
the source packages remain unpublished and undeployed.

This recommendation applies only to the reviewed source candidate and test
context. Package publication, Release, Deployment, production support,
customer adoption, Authority, Certification, and Truth remain separate Human
gates.
