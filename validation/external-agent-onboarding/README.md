# External Agent Technical Onboarding D12

This package tests whether an initially unfamiliar Agent can discover and use
the TITMAS machine surface through MCP or the generated SDK. It is a validation
harness, not a Runtime, service, Tenant-registration path, or Authority.

## Agent-readable entry

| Item | Value |
|---|---|
| Decision | `TITMAS-FINAL-FORM-P0-10-EXTERNAL-AGENT-TECHNICAL-ONBOARDING-D12` |
| Scenario | [`scenario.json`](scenario.json) |
| Harness | [`run-live.mjs`](run-live.mjs) |
| Pre-development advisory | [`TITMAS-EXTERNAL-AGENT-ONBOARDING-D12-AGENT-RECOMMENDATION-v1.0.md`](TITMAS-EXTERNAL-AGENT-ONBOARDING-D12-AGENT-RECOMMENDATION-v1.0.md) |
| Machine report | [`artifacts/d12-validation-report.json`](artifacts/d12-validation-report.json) |
| Post-D13 rerun | [`artifacts/post-d13-validation-report.json`](artifacts/post-d13-validation-report.json) |
| Human report | [`TITMAS-EXTERNAL-AGENT-TECHNICAL-ONBOARDING-D12-REPORT-v1.0.md`](TITMAS-EXTERNAL-AGENT-TECHNICAL-ONBOARDING-D12-REPORT-v1.0.md) |
| Result | `FAIL_CLOSED_AFTER_RUNTIME_ALIGNMENT` |

The initial task contains no TITMAS tool name, API path, Schema name, or correct
call sequence. A provider credential may be loaded by the operator, but
delegated TITMAS credentials remain inside the harness and MCP process. They
are rejected if they appear in a provider request or evidence artifact.

## Reproduction boundary

The live run requires two separately provisioned, synthetic, time-bounded
credentials with the exact scopes in `scenario.json`. Credential files stay
outside the repository at mode `0600` and are supplied only by environment
variables:

```text
D12_MCP_CREDENTIAL_FILE
D12_SDK_CREDENTIAL_FILE
DASHSCOPE_API_KEY
DASHSCOPE_BASE_URL
```

Do not put values from these variables in source, logs, prompts, Issues, or
pull requests. The harness does not create a Tenant or credential. Provisioning
and revocation remain offline operator actions under a separate Human Decision.

Build the already approved SDK and MCP surfaces, then run:

```bash
cd titmas-typescript-sdk && npm ci && npm test
cd ../mcp && npm ci && npm test
cd ../validation/external-agent-onboarding
npm ci
npm test
npm run run:live
npm run validate:report
```

`validate:report` proves evidence integrity. Add `-- --require-pass` only when
the machine report claims every D12 success gate. Evidence integrity is not a
successful onboarding result.

## Current finding

The first run found a live-runtime divergence from the frozen API v1 request
envelope. D13 deployed the already-merged API v1 implementation without
changing the contract, SDK, MCP adapter, database Schema, quota, Receipt
storage, or D04 history. A second run confirmed that the legacy HTTP `422`
envelope blocker was removed.

D12 still does not pass. Both Agent paths independently discovered the service,
read capabilities and Schemas, reached preflight, and fetched Receipts. They did
not construct two objects that passed Schema validation and did not complete
two valid Receipt verifications. The exact current finding is therefore a
bounded Agent-onboarding usability failure whose sole root cause is not yet
proven; it is not the earlier runtime-contract divergence.

The harness must not compensate by supplying sample answers, rewriting SDK or
MCP requests, or relabeling failed validation as success. The original and
post-D13 evidence sets are preserved separately.

Permanent boundaries:

- `Receipt != Truth`
- `Verification != Authorization`
- `Preflight PASS != Certification`
- `Evidence integrity != D12 PASS`
- `Synthetic Agent != customer adoption`
