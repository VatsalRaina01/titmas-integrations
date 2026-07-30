from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime
from typing import Any, cast

import httpx

from titmas_agent_sdk.errors import (
    TitmasApiError,
    TitmasAuthenticationError,
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
            raise TitmasApiError("TITMAS returned an unknown result value", response=body)
        receipt = body.get("receipt")
        if not isinstance(receipt, dict):
            raise TitmasApiError("TITMAS response omitted the Receipt", response=body)
        return PreflightOutcome(
            result=cast(Result, result),
            reason_codes=tuple(str(item) for item in body.get("reason_codes", [])),
            schema_name=_optional_string(body.get("schema_name")),
            schema_version=_optional_string(body.get("schema_version")),
            object_type=_optional_string(body.get("object_type")),
            receipt=receipt,
            idempotent_replay=bool(body.get("idempotent_replay", False)),
            formal_conformance=body.get("formal_conformance") is True,
            certification=body.get("certification") is True,
            truth_claim=body.get("truth_claim") is True,
            authorization_effect=body.get("authorization_effect") is True,
        )

    def verify_receipt(self, receipt: dict[str, Any]) -> ReceiptVerification:
        body = self._post("/api/v1/receipts/verify", receipt)
        return ReceiptVerification(
            valid=body.get("valid") is True,
            reason_code=str(body.get("reason_code", "UNKNOWN")),
            receipt_hash=_optional_string(body.get("receipt_hash")),
            structure_only=body.get("structure_only") is True,
            chain_valid=str(body.get("chain_valid", "NOT_ASSESSED")),
            truth_verified=body.get("truth_verified") is True,
            authorization_effect=body.get("authorization_effect") is True,
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
