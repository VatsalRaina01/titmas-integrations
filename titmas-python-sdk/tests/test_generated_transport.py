from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import httpx
import pytest
from pydantic import ValidationError
from titmas_api_client.api.default_api import DefaultApi
from titmas_api_client.api_client import ApiClient
from titmas_api_client.configuration import Configuration
from titmas_api_client.models.authority_boundaries import AuthorityBoundaries
from titmas_api_client.models.preflight_request import PreflightRequest
from titmas_api_client.models.result import Result
from titmas_api_client.sync_helper import run_sync


def test_generated_transport_posts_once_with_bearer_credential() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(
            200,
            json={
                "completed_at": "2026-08-01T00:00:00Z",
                "reason_codes": ["INSUFFICIENT_EVIDENCE"],
                "receipt_id": "30000000-0000-4000-8000-000000000001",
                "request_id": "request-001",
                "result": "NOT_ASSESSED",
                "schema_id": None,
                "schema_version": None,
            },
        )

    configuration = Configuration(
        host="https://example.invalid",
        access_token="synthetic-token",  # noqa: S106 - synthetic contract fixture
        retries=0,
    )
    api_client = ApiClient(configuration)
    api_client.rest_client.pool_manager = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    api = DefaultApi(api_client)
    request = PreflightRequest(
        agent_id="20000000-0000-4000-8000-000000000001",
        api_version="v1",
        credential_id="40000000-0000-4000-8000-000000000001",
        idempotency_key="attempt-001",
        object={},
        object_digest="0" * 64,
        request_id="request-001",
        schema_id="entity-object",
        schema_version="v0.1",
        tenant_id="10000000-0000-4000-8000-000000000001",
        timestamp=datetime(2026, 8, 1, tzinfo=UTC),
    )

    response = api.titmas_preflight_sync(
        preflight_request=request,
        idempotency_key="attempt-001",
    )
    run_sync(api_client.close())

    assert response.result == Result.NOT_ASSESSED
    assert len(calls) == 1
    assert calls[0].method == "POST"
    assert calls[0].url.path == "/api/v1/preflight"
    assert calls[0].headers["authorization"] == "Bearer synthetic-token"
    assert UUID(response.receipt_id.hex) == response.receipt_id


def test_generated_authority_boundaries_enforce_boolean_false() -> None:
    valid = AuthorityBoundaries(
        commercial_offer_active=False,
        evidence_is_truth=False,
        preflight_is_formal_conformance=False,
        production_ready=False,
        receipt_is_certification=False,
        verification_is_authorization=False,
    )
    assert valid.evidence_is_truth is False

    with pytest.raises(ValidationError):
        AuthorityBoundaries(
            commercial_offer_active=True,
            evidence_is_truth=False,
            preflight_is_formal_conformance=False,
            production_ready=False,
            receipt_is_certification=False,
            verification_is_authorization=False,
        )
