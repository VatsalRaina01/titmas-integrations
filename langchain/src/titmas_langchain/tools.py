from __future__ import annotations

import json
from typing import Any

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from titmas_agent_sdk import TitmasClient


class PreflightInput(BaseModel):
    request_id: str = Field(min_length=1, max_length=128)
    idempotency_key: str = Field(min_length=1, max_length=128)
    tenant_id: str
    agent_identity: str
    object_json: str = Field(
        description="JSON object to preflight; customer secrets are prohibited."
    )
    schema_name: str | None = None


class ReceiptInput(BaseModel):
    receipt_json: str = Field(description="Signed TITMAS Receipt JSON object.")


def build_titmas_tools(client: TitmasClient) -> list[StructuredTool]:
    def preflight(
        request_id: str,
        idempotency_key: str,
        tenant_id: str,
        agent_identity: str,
        object_json: str,
        schema_name: str | None = None,
    ) -> str:
        """Run bounded Schema preflight; preserve PASS, FAIL, or NOT_ASSESSED."""
        value = _object(object_json)
        outcome = client.preflight(
            request_id=request_id,
            idempotency_key=idempotency_key,
            tenant_id=tenant_id,
            agent_identity=agent_identity,
            object_value=value,
            schema_name=schema_name,
        )
        return json.dumps(
            {
                "result": outcome.result,
                "reason_codes": outcome.reason_codes,
                "receipt": outcome.receipt,
                "formal_conformance": outcome.formal_conformance,
                "truth_claim": outcome.truth_claim,
                "authorization_effect": outcome.authorization_effect,
            },
            sort_keys=True,
        )

    def verify_receipt(receipt_json: str) -> str:
        """Verify Receipt structure/signature, not truth or authorization."""
        verification = client.verify_receipt(_object(receipt_json))
        return json.dumps(
            {
                "valid": verification.valid,
                "reason_code": verification.reason_code,
                "structure_only": verification.structure_only,
                "truth_verified": verification.truth_verified,
                "authorization_effect": verification.authorization_effect,
            },
            sort_keys=True,
        )

    def quota() -> str:
        """Read the quota bound to the delegated machine credential."""
        return json.dumps(client.quota(), sort_keys=True)

    return [
        StructuredTool.from_function(
            func=preflight,
            name="titmas_preflight",
            description=(
                "Run TITMAS Schema preflight and preserve PASS, FAIL, or "
                "NOT_ASSESSED. This is not formal conformance."
            ),
            args_schema=PreflightInput,
        ),
        StructuredTool.from_function(
            func=verify_receipt,
            name="titmas_verify_receipt",
            description=(
                "Verify a TITMAS Receipt's structure/signature. This does not "
                "verify truth, authority, certification, or standard adoption."
            ),
            args_schema=ReceiptInput,
        ),
        StructuredTool.from_function(
            func=quota,
            name="titmas_quota",
            description="Read delegated Tenant quota without modifying it.",
        ),
    ]


def _object(value: str) -> dict[str, Any]:
    loaded = json.loads(value)
    if not isinstance(loaded, dict):
        raise TypeError("input must be a JSON object")
    return loaded
