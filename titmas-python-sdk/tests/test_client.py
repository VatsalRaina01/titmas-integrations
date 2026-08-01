from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

import pytest
from pydantic import ValidationError
from titmas_api_client.api.default_api import DefaultApi
from titmas_api_client.models.preflight_result import PreflightResult
from titmas_api_client.models.reason_code import ReasonCode
from titmas_api_client.models.receipt import Receipt
from titmas_api_client.models.receipt_verification import ReceiptVerification
from titmas_api_client.models.receipt_verification_status import ReceiptVerificationStatus
from titmas_api_client.models.result import Result

from titmas_agent_sdk import TitmasAuthenticationError, TitmasClient


class FakeGeneratedApi:
    def __init__(self) -> None:
        self.preflight_calls: list[dict[str, Any]] = []
        self.verification_calls: list[dict[str, Any]] = []

    def titmas_preflight_sync(self, **kwargs: Any) -> PreflightResult:
        self.preflight_calls.append(kwargs)
        request = kwargs["preflight_request"]
        return PreflightResult(
            completed_at=datetime(2026, 8, 1, tzinfo=UTC),
            reason_codes=[ReasonCode.INSUFFICIENT_EVIDENCE],
            receipt_id=UUID("30000000-0000-4000-8000-000000000001"),
            request_id=request.request_id,
            result=Result.NOT_ASSESSED,
            schema_id=None,
            schema_version=None,
        )

    def titmas_verify_receipt_sync(self, **kwargs: Any) -> ReceiptVerification:
        self.verification_calls.append(kwargs)
        return ReceiptVerification(
            reason_codes=[ReasonCode.OBJECT_INVALID],
            valid=False,
            verification_status=ReceiptVerificationStatus.INVALID_SIGNATURE,
        )


def client(fake: FakeGeneratedApi) -> TitmasClient:
    return TitmasClient(
        credential="synthetic-token",
        credential_id="40000000-0000-4000-8000-000000000001",
        generated_api=cast(DefaultApi, fake),
    )


def test_preflight_uses_generated_api_and_preserves_not_assessed() -> None:
    fake = FakeGeneratedApi()
    outcome = client(fake).preflight(
        request_id="request-001",
        idempotency_key="attempt-001",
        tenant_id="10000000-0000-4000-8000-000000000001",
        agent_identity="20000000-0000-4000-8000-000000000001",
        schema_id="entity-object",
        schema_version="v0.1",
        object_digest="0" * 64,
        object_value={"object_type": "ENTITY"},
    )

    assert len(fake.preflight_calls) == 1
    request = fake.preflight_calls[0]["preflight_request"]
    assert request.api_version == "v1"
    assert request.credential_id == "40000000-0000-4000-8000-000000000001"
    assert outcome.result == "NOT_ASSESSED"
    assert outcome.reason_codes == ("INSUFFICIENT_EVIDENCE",)
    assert outcome.formal_conformance is False
    assert outcome.truth_claim is False
    assert outcome.authorization_effect is False


def test_receipt_verification_is_bounded_and_uses_generated_api() -> None:
    fake = FakeGeneratedApi()
    receipt = Receipt(
        receipt_id=UUID("30000000-0000-4000-8000-000000000001"),
        receipt_sequence=1,
        result=Result.FAIL,
        signature_metadata={},
        tenant_id=UUID("10000000-0000-4000-8000-000000000001"),
    )
    verification = client(fake).verify_receipt(receipt)

    assert len(fake.verification_calls) == 1
    assert verification.valid is False
    assert verification.verification_status == "INVALID_SIGNATURE"
    assert verification.structure_only is True
    assert verification.truth_verified is False
    assert verification.authorization_effect is False


def test_invalid_digest_fails_before_generated_transport() -> None:
    fake = FakeGeneratedApi()
    with pytest.raises(ValidationError):
        client(fake).preflight(
            request_id="request-001",
            idempotency_key="attempt-001",
            tenant_id="10000000-0000-4000-8000-000000000001",
            agent_identity="20000000-0000-4000-8000-000000000001",
            schema_id="entity-object",
            schema_version="v0.1",
            object_digest="not-a-digest",
            object_value={},
        )
    assert fake.preflight_calls == []


def test_missing_credential_context_fails_closed() -> None:
    fake = FakeGeneratedApi()
    missing_secret = TitmasClient(
        credential_id="credential-001",
        generated_api=cast(DefaultApi, fake),
    )
    with pytest.raises(TitmasAuthenticationError, match="delegated machine credential"):
        missing_secret.quota()

    missing_id = TitmasClient(
        credential="synthetic-token",
        generated_api=cast(DefaultApi, fake),
    )
    with pytest.raises(TitmasAuthenticationError, match="credential_id"):
        missing_id.preflight(
            request_id="request-001",
            idempotency_key="attempt-001",
            tenant_id="tenant-001",
            agent_identity="agent-001",
            schema_id="entity-object",
            schema_version="v0.1",
            object_digest="0" * 64,
            object_value={},
        )
