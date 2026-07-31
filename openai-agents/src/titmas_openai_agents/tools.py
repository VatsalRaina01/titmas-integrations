from __future__ import annotations

import json
from typing import Any

from agents import FunctionTool, function_tool
from titmas_agent_sdk import TitmasClient


def build_titmas_tools(client: TitmasClient) -> list[FunctionTool]:
    @function_tool
    def titmas_preflight(
        request_id: str,
        idempotency_key: str,
        tenant_id: str,
        agent_identity: str,
        object_json: str,
        schema_name: str | None = None,
    ) -> str:
        """Run Schema preflight and preserve PASS, FAIL, or NOT_ASSESSED.

        Args:
            request_id: Caller-generated bounded request identifier.
            idempotency_key: Stable key for this logical protected call.
            tenant_id: Delegated Tenant identifier.
            agent_identity: Delegated Agent identifier.
            object_json: JSON object with no customer secrets.
            schema_name: Optional exact catalog Schema name.
        """
        outcome = client.preflight(
            request_id=request_id,
            idempotency_key=idempotency_key,
            tenant_id=tenant_id,
            agent_identity=agent_identity,
            object_value=_object(object_json),
            schema_name=schema_name,
        )
        return json.dumps(
            {
                "result": outcome.result,
                "reason_codes": outcome.reason_codes,
                "receipt": outcome.receipt,
                "formal_conformance": outcome.formal_conformance,
                "certification": outcome.certification,
                "truth_claim": outcome.truth_claim,
                "authorization_effect": outcome.authorization_effect,
            },
            sort_keys=True,
        )

    @function_tool
    def titmas_verify_receipt(receipt_json: str) -> str:
        """Verify Receipt structure/signature, not truth or authority.

        Args:
            receipt_json: Signed TITMAS Receipt JSON object.
        """
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

    @function_tool
    def titmas_quota() -> str:
        """Read the delegated Tenant quota without changing it."""
        return json.dumps(client.quota(), sort_keys=True)

    return [titmas_preflight, titmas_verify_receipt, titmas_quota]


def _object(value: str) -> dict[str, Any]:
    loaded = json.loads(value)
    if not isinstance(loaded, dict):
        raise TypeError("input must be a JSON object")
    return loaded
