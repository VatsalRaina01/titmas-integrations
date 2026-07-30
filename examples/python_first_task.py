"""Minimal machine-first TITMAS task; no HTML or model runtime required."""

from __future__ import annotations

import os

from titmas_agent_sdk import TitmasClient

required = ("TITMAS_CREDENTIAL", "TITMAS_TENANT_ID", "TITMAS_AGENT_ID")
missing = [name for name in required if not os.environ.get(name)]
if missing:
    raise SystemExit(f"missing delegated environment variables: {', '.join(missing)}")

with TitmasClient(credential=os.environ["TITMAS_CREDENTIAL"]) as client:
    result = client.preflight(
        request_id="example-task-001",
        idempotency_key="example-task-001-attempt-1",
        tenant_id=os.environ["TITMAS_TENANT_ID"],
        agent_identity=os.environ["TITMAS_AGENT_ID"],
        object_value={"object_type": "UNKNOWN", "version": "v0.1"},
    )
    print(result.result)
    print(client.verify_receipt(result.receipt).valid)
    print(client.quota()["remaining_requests"])
