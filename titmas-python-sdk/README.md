# TITMAS Python SDK

This source candidate uses transport code generated from the frozen
`openapi/titmas-api-v1.yaml` contract. The handwritten `src/` layer only adds
TITMAS result and authority semantics; it does not send HTTP itself.

```bash
python3.13 -m venv .venv
.venv/bin/pip install -e '.[dev]'
```

```python
from titmas_agent_sdk import TitmasClient

with TitmasClient(
    credential="delegated-machine-credential",
    credential_id="delegated-credential-id",
) as client:
    outcome = client.preflight(
        request_id="agent-task-001",
        idempotency_key="agent-task-001-attempt-1",
        tenant_id="10000000-0000-4000-8000-000000000001",
        agent_identity="20000000-0000-4000-8000-000000000001",
        schema_id="entity-object",
        schema_version="v0.1",
        object_digest="0" * 64,
        object_value={"object_type": "ENTITY", "version": "v0.1"},
    )
    assert outcome.result in {"PASS", "FAIL", "NOT_ASSESSED"}
```

`PASS` is not formal Conformance. A Receipt is not Truth, Certification or
Authorization. The SDK never automatically retries protected POST operations.
Packages are not published and no credential or service access is granted.

Regenerate only with `../scripts/generate-sdks.sh`; never edit `generated/`.
