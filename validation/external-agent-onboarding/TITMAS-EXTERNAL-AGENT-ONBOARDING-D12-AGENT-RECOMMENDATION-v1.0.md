# TITMAS External Agent Onboarding D12 Agent Recommendation v1.0

## Pre-development question

The external advisory Agent was asked whether it would recommend this bounded
onboarding validation to a customer who needs an unfamiliar Agent to discover
and use TITMAS without receiving product-specific answers.

Advisory model:

```text
MODEL=qwen3.7-max
ROLE=ADVISORY_NOT_AUTHORITY
RECOMMENDATION=RECOMMENDED
WOULD_RECOMMEND_TO_CUSTOMER=true
AUTHORITY_EFFECT=false
```

## Why it recommended the validation

The advisory Agent considered the machine-discovery, MCP, SDK, preflight,
Receipt-verification, credential-separation, and second-use checks sufficient
for a bounded technical-onboarding experiment. It required machine-readable
evidence, proof that credentials never reached model prompts or Git, exact
identity/scope/TTL mapping, and fail-closed behavior.

## Correctable findings

1. One synthetic Tenant cannot establish multi-tenant onboarding behavior.
2. Four-hour credentials need explicit closure or rotation for longer runs.
3. `Receipt != Truth` and `Verification != Authorization` must stay visible in
   Agent-readable descriptions and reports.

The first point was not expanded because D12 authorizes at most one synthetic
Tenant. It remains a limitation rather than an excuse to exceed scope. The
second was addressed by revoking both credentials after the run. The third is
enforced by the MCP/SDK contracts, the Agent system message, and report checks.

## Stop conditions adopted

- any credential disclosure;
- customer, payment, production, or administrator access;
- API, SDK, MCP, database Schema, Receipt-storage, deployment, or D04 change;
- more than three Agent identities or credentials;
- treating Receipt verification as Authority, Truth, certification, or
  commercial adoption.

The advisory recommendation did not approve implementation, deployment,
release, commercial use, or a successful D12 result.
