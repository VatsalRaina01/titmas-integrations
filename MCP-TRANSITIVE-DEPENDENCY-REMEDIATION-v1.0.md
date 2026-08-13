# MCP Transitive Dependency Remediation v1.0

Observed: 2026-08-13 (Asia/Shanghai)
Scope: `mcp/package-lock.json` only

`npm audit --omit=dev --audit-level=high` identified two transitive findings in the existing MCP source-candidate lockfile:

- `fast-uri` 3.1.4: one high-severity advisory;
- `hono` 4.12.32: moderate and lower advisories.

The package manifest and official MCP SDK pin remain unchanged. A lock-only compatible resolution moved:

- `fast-uri` from 3.1.4 to 3.1.5;
- `hono` from 4.12.32 to 4.13.1.

Post-remediation evidence:

```text
MCP_CONTRACT_TESTS=9_PASS
NPM_PRODUCTION_AUDIT=0_VULNERABILITIES
OFFICIAL_MCP_SDK_PIN=1.30.0_UNCHANGED
API_CONTRACT_CHANGED=false
SDK_SOURCE_CHANGED=false
PACKAGE_PUBLISHED=false
DEPLOYED=false
```

This is dependency hygiene for a source candidate. It is not a package release, production security approval, independent audit or deployment result.
