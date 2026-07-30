# TITMAS Python SDK

```bash
python3.13 -m venv .venv
.venv/bin/pip install -e .
```

```python
from titmas_agent_sdk import TitmasClient

with TitmasClient(
    base_url="https://redcrag.cn",
    credential="delegated-machine-credential",
) as client:
    capabilities = client.capabilities()
    outcome = client.preflight(
        request_id="agent-task-001",
        idempotency_key="agent-task-001-attempt-1",
        tenant_id="delegated-tenant-uuid",
        agent_identity="delegated-agent-uuid",
        object_value={"object_type": "UNKNOWN", "version": "v0.1"},
    )
    assert outcome.result in {"PASS", "FAIL", "NOT_ASSESSED"}
    verification = client.verify_receipt(outcome.receipt)
```

The SDK retries bounded `GET` requests after transport or 502/503/504 failures.
It does not automatically retry `POST /preflight` or Receipt verification,
because a timeout after dispatch is not proof that the server did not process
the operation. Reuse the same idempotency key only after the caller resolves
that uncertainty.
