from __future__ import annotations

from datetime import datetime
from typing import Any, cast

from titmas_api_client.api.default_api import DefaultApi
from titmas_api_client.api_client import ApiClient
from titmas_api_client.configuration import Configuration
from titmas_api_client.models.preflight_request import PreflightRequest
from titmas_api_client.models.receipt import Receipt
from titmas_api_client.models.receipt_response import ReceiptResponse
from titmas_api_client.models.receipt_verify_request import ReceiptVerifyRequest
from titmas_api_client.sync_helper import run_sync

from titmas_agent_sdk.semantics import (
    BoundedPreflightOutcome,
    BoundedReceiptVerification,
    TitmasContractError,
    bound_preflight,
    bound_receipt_verification,
)


class TitmasAuthenticationError(TitmasContractError):
    """A protected operation was requested without its delegated credential context."""


class TitmasClient:
    """Thin semantic wrapper over the generated API client.

    This class does not implement HTTP transport, retries, authorization, or
    result inference. Transport is generated from the frozen OpenAPI contract.
    """

    def __init__(
        self,
        *,
        base_url: str = "https://redcrag.cn",
        credential: str | None = None,
        credential_id: str | None = None,
        timeout_seconds: float = 15.0,
        generated_api: DefaultApi | None = None,
    ) -> None:
        if not base_url.startswith(("https://", "http://")):
            raise ValueError("base_url must be an absolute HTTP(S) URL")
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")

        self._credential = credential
        self._credential_id = credential_id
        self._timeout_seconds = timeout_seconds
        self._api_client: ApiClient | None = None

        if generated_api is not None:
            self._api = generated_api
            return

        configuration = Configuration(
            host=base_url.rstrip("/"),
            access_token=credential,
            retries=0,
        )
        self._api_client = ApiClient(configuration)
        self._api_client.user_agent = "titmas-agent-sdk-python/0.1.0 generated-transport"
        self._api = DefaultApi(self._api_client)

    def __enter__(self) -> TitmasClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        if self._api_client is not None:
            run_sync(self._api_client.close())  # type: ignore[no-untyped-call]

    def capabilities(self) -> dict[str, Any]:
        return cast(
            dict[str, Any],
            self._api.titmas_get_capabilities_sync(_request_timeout=self._timeout_seconds),
        )

    def status(self) -> dict[str, Any]:
        return cast(
            dict[str, Any],
            self._api.titmas_status_sync(_request_timeout=self._timeout_seconds),
        )

    def catalog(self) -> Any:
        self._require_protected_context()
        return self._api.titmas_get_catalog_sync(_request_timeout=self._timeout_seconds)

    def quota(self) -> Any:
        self._require_protected_context()
        return self._api.titmas_get_quota_sync(_request_timeout=self._timeout_seconds)

    def usage(self) -> Any:
        self._require_protected_context()
        return self._api.titmas_get_usage_sync(_request_timeout=self._timeout_seconds)

    def receipt(self, receipt_id: str) -> ReceiptResponse:
        self._require_protected_context()
        return self._api.titmas_get_receipt_sync(
            receipt_id=receipt_id,
            _request_timeout=self._timeout_seconds,
        )

    def preflight(
        self,
        *,
        request_id: str,
        idempotency_key: str,
        tenant_id: str,
        agent_identity: str,
        object_value: Any,
        schema_id: str,
        schema_version: str,
        object_digest: str,
        timestamp: datetime | None = None,
        credential_id: str | None = None,
    ) -> BoundedPreflightOutcome:
        effective_credential_id = self._require_protected_context(
            credential_id=credential_id or self._credential_id
        )
        request = PreflightRequest(
            agent_id=agent_identity,
            api_version="v1",
            credential_id=effective_credential_id,
            idempotency_key=idempotency_key,
            object=object_value,
            object_digest=object_digest,
            request_id=request_id,
            schema_id=schema_id,
            schema_version=schema_version,
            tenant_id=tenant_id,
            timestamp=timestamp,
        )
        result = self._api.titmas_preflight_sync(
            preflight_request=request,
            idempotency_key=idempotency_key,
            _request_timeout=self._timeout_seconds,
        )
        return bound_preflight(result)

    def verify_receipt(
        self,
        receipt: Receipt | dict[str, Any],
    ) -> BoundedReceiptVerification:
        self._require_protected_context()
        value = receipt if isinstance(receipt, Receipt) else Receipt.from_dict(receipt)
        if value is None:
            raise TitmasContractError(
                "Receipt must be a contract-valid object",
                reason_code="RECEIPT_CONTRACT_VIOLATION",
            )
        result = self._api.titmas_verify_receipt_sync(
            receipt_verify_request=ReceiptVerifyRequest(receipt=value),
            _request_timeout=self._timeout_seconds,
        )
        return bound_receipt_verification(result)

    def _require_protected_context(self, *, credential_id: str | None = None) -> str:
        if not self._credential:
            raise TitmasAuthenticationError(
                "a delegated machine credential is required",
                reason_code="CREDENTIAL_MISSING",
            )
        resolved_credential_id = credential_id or self._credential_id
        if resolved_credential_id is None:
            raise TitmasAuthenticationError(
                "credential_id is required by the frozen API v1 contract",
                reason_code="CREDENTIAL_ID_MISSING",
            )
        return resolved_credential_id
