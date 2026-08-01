"""Minimal machine-first TITMAS task; no HTML or model runtime required."""

from __future__ import annotations

import os

from titmas_agent_sdk import TitmasClient

required = (
    "TITMAS_CREDENTIAL",
    "TITMAS_CREDENTIAL_ID",
    "TITMAS_TENANT_ID",
    "TITMAS_AGENT_ID",
    "TITMAS_OBJECT_DIGEST",
)
missing = [name for name in required if not os.environ.get(name)]
if missing:
    raise SystemExit(f"missing delegated environment variables: {', '.join(missing)}")

with TitmasClient(
    credential=os.environ["TITMAS_CREDENTIAL"],
    credential_id=os.environ["TITMAS_CREDENTIAL_ID"],
) as client:
    result = client.preflight(
        request_id="example-task-001",
        idempotency_key="example-task-001-attempt-1",
        tenant_id=os.environ["TITMAS_TENANT_ID"],
        agent_identity=os.environ["TITMAS_AGENT_ID"],
        schema_id="entity-object",
        schema_version="v0.1",
        object_digest=os.environ["TITMAS_OBJECT_DIGEST"],
        object_value={"object_type": "UNKNOWN", "version": "v0.1"},
    )
    print(result.result)
    receipt = client.receipt(result.receipt_id).receipt
    print(client.verify_receipt(receipt).valid)
    print(client.quota()["remaining_requests"])
