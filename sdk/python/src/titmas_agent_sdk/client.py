from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime
from typing import Any, cast

import httpx

from titmas_agent_sdk.errors import (
    TitmasApiError,
    TitmasAuthenticationError,
    TitmasContractError,
    TitmasQuotaError,
    TitmasScopeError,
    TitmasTransportError,
)
from titmas_agent_sdk.models import PreflightOutcome, ReceiptVerification, Result


class TitmasClient:
    def __init__(
        self,
        *,
        base_url: str = "https://redcrag.cn",
        credential: str | None = None,
        timeout_seconds: float = 15.0,
        get_retry_attempts: int = 2,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        if not base_url.startswith(("https://", "http://")):
            raise ValueError("base_url must be an absolute HTTP(S) URL")
        if get_retry_attempts < 0 or get_retry_attempts > 3:
            raise ValueError("get_retry_attempts must be between 0 and 3")
        self._credential = credential
        self._get_retry_attempts = get_retry_attempts
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            transport=transport,
            headers={"User-Agent": "titmas-agent-sdk-python/0.1.0"},
            follow_redirects=False,
            trust_env=False,
        )

    def __enter__(self) -> TitmasClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def capabilities(self) -> dict[str, Any]:
        return self._get("/api/v1/capabilities", authenticated=False)

    def plans(self) -> dict[str, Any]:
        return self._get("/api/v1/plans", authenticated=False)

    def status(self) -> dict[str, Any]:
        return self._get("/api/v1/status", authenticated=False)

    def catalog(self) -> dict[str, Any]:
        return self._get("/api/v1/catalog")

    def schema(self, schema_name: str) -> dict[str, Any]:
        if not schema_name or "/" in schema_name or ".." in schema_name:
            raise ValueError("schema_name is invalid")
        return self._get(f"/api/v1/schemas/{schema_name}")

    def usage(self) -> dict[str, Any]:
        return self._get("/api/v1/usage")

    def quota(self) -> dict[str, Any]:
        return self._get("/api/v1/quota")

    def receipt(self, receipt_id: str) -> dict[str, Any]:
        try:
            uuid.UUID(receipt_id)
        except ValueError as exc:
            raise ValueError("receipt_id must be a UUID") from exc
        return self._get(f"/api/v1/receipts/{receipt_id}")

    def preflight(
        self,
        *,
        request_id: str,
        idempotency_key: str,
        tenant_id: str,
        agent_identity: str,
        object_value: Any,
        schema_name: str | None = None,
        timestamp: datetime | None = None,
    ) -> PreflightOutcome:
        envelope: dict[str, Any] = {
            "api_version": "v1",
            "request_id": request_id,
            "idempotency_key": idempotency_key,
            "tenant_id": tenant_id,
            "agent_identity": agent_identity,
            "timestamp": (timestamp or datetime.now(UTC)).isoformat(),
            "object": object_value,
        }
        if schema_name is not None:
            envelope["schema_name"] = schema_name
        body = self._post("/api/v1/preflight", envelope)
        result = body.get("result")
        if result not in {"PASS", "FAIL", "NOT_ASSESSED"}:
            raise TitmasContractError(
                "TITMAS returned an unknown result value",
                reason_code="RESULT_SEMANTICS_VIOLATION",
                response=body,
            )
        receipt = body.get("receipt")
        if not isinstance(receipt, dict):
            raise TitmasContractError(
                "TITMAS response omitted the Receipt",
                reason_code="RECEIPT_CONTRACT_VIOLATION",
                response=body,
            )
        reason_codes = body.get("reason_codes")
        if not isinstance(reason_codes, list) or not all(
            isinstance(item, str) for item in reason_codes
        ):
            raise TitmasContractError(
                "TITMAS returned invalid reason_codes",
                reason_code="RESULT_SEMANTICS_VIOLATION",
                response=body,
            )
        _require_boolean(body, "idempotent_replay")
        for field in (
            "formal_conformance",
            "certification",
            "truth_claim",
            "authorization_effect",
        ):
            _require_false(body, field, context="preflight")
        return PreflightOutcome(
            result=cast(Result, result),
            reason_codes=tuple(reason_codes),
            schema_name=_optional_string(body.get("schema_name")),
            schema_version=_optional_string(body.get("schema_version")),
            object_type=_optional_string(body.get("object_type")),
            receipt=receipt,
            idempotent_replay=cast(bool, body["idempotent_replay"]),
            formal_conformance=False,
            certification=False,
            truth_claim=False,
            authorization_effect=False,
        )

    def verify_receipt(self, receipt: dict[str, Any]) -> ReceiptVerification:
        body = self._post("/api/v1/receipts/verify", receipt)
        _require_boolean(body, "valid")
        if body.get("structure_only") is not True:
            raise TitmasContractError(
                "Receipt verification must remain structure-only",
                reason_code="RECEIPT_AUTHORITY_BOUNDARY_VIOLATION",
                response=body,
            )
        for field in ("truth_verified", "authorization_effect"):
            _require_false(body, field, context="receipt verification")
        reason_code = body.get("reason_code")
        chain_valid = body.get("chain_valid")
        if not isinstance(reason_code, str) or not isinstance(chain_valid, str):
            raise TitmasContractError(
                "Receipt verification returned invalid status fields",
                reason_code="RECEIPT_CONTRACT_VIOLATION",
                response=body,
            )
        receipt_hash = body.get("receipt_hash")
        if receipt_hash is not None and not isinstance(receipt_hash, str):
            raise TitmasContractError(
                "Receipt verification returned an invalid hash",
                reason_code="RECEIPT_CONTRACT_VIOLATION",
                response=body,
            )
        return ReceiptVerification(
            valid=cast(bool, body["valid"]),
            reason_code=reason_code,
            receipt_hash=receipt_hash,
            structure_only=True,
            chain_valid=chain_valid,
            truth_verified=False,
            authorization_effect=False,
        )

    def _get(self, path: str, *, authenticated: bool = True) -> dict[str, Any]:
        attempts = self._get_retry_attempts + 1
        last_error: Exception | None = None
        for attempt in range(attempts):
            try:
                response = self._client.get(path, headers=self._headers(authenticated))
            except httpx.TransportError as exc:
                last_error = exc
                if attempt + 1 == attempts:
                    break
                time.sleep(0.1 * (attempt + 1))
                continue
            if response.status_code not in {502, 503, 504} or attempt + 1 == attempts:
                return self._decode(response)
            time.sleep(0.1 * (attempt + 1))
        raise TitmasTransportError(
            "bounded GET transport failed",
            reason_code="GET_TRANSPORT_FAILED",
        ) from last_error

    def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        try:
            response = self._client.post(
                path,
                headers=self._headers(True),
                json=body,
            )
        except httpx.TransportError as exc:
            raise TitmasTransportError(
                "POST outcome is unknown; automatic retry was not attempted",
                reason_code="POST_DISPATCH_UNKNOWN",
            ) from exc
        return self._decode(response)

    def _headers(self, authenticated: bool) -> dict[str, str]:
        headers = {"X-Request-ID": f"sdk-{uuid.uuid4()}"}
        if authenticated:
            if not self._credential:
                raise TitmasAuthenticationError(
                    "a delegated machine credential is required",
                    reason_code="CREDENTIAL_MISSING",
                )
            headers["Authorization"] = f"Bearer {self._credential}"
        return headers

    @staticmethod
    def _decode(response: httpx.Response) -> dict[str, Any]:
        try:
            value = response.json()
        except ValueError as exc:
            raise TitmasApiError(
                "TITMAS returned non-JSON content",
                status_code=response.status_code,
            ) from exc
        if not isinstance(value, dict):
            raise TitmasApiError(
                "TITMAS returned a non-object JSON response",
                status_code=response.status_code,
            )
        if response.is_success:
            return value
        reason = _optional_string(value.get("reason_code"))
        message = str(value.get("title") or value.get("detail") or "TITMAS API error")
        if response.status_code == 401:
            raise TitmasAuthenticationError(
                message,
                status_code=response.status_code,
                reason_code=reason,
                response=value,
            )
        if response.status_code == 403:
            raise TitmasScopeError(
                message,
                status_code=response.status_code,
                reason_code=reason,
                response=value,
            )
        if response.status_code == 429:
            raise TitmasQuotaError(
                message,
                status_code=response.status_code,
                reason_code=reason,
                response=value,
            )
        raise TitmasApiError(
            message,
            status_code=response.status_code,
            reason_code=reason,
            response=value,
        )


def _optional_string(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _require_boolean(body: dict[str, Any], field: str) -> None:
    if not isinstance(body.get(field), bool):
        raise TitmasContractError(
            f"TITMAS response field {field} must be a boolean",
            reason_code="RESPONSE_CONTRACT_VIOLATION",
            response=body,
        )


def _require_false(body: dict[str, Any], field: str, *, context: str) -> None:
    if body.get(field) is not False:
        raise TitmasContractError(
            f"{context} field {field} must remain false",
            reason_code="AUTHORITY_BOUNDARY_VIOLATION",
            response=body,
        )
