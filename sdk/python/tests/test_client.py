from __future__ import annotations

import httpx
import pytest

from titmas_agent_sdk import (
    TitmasAuthenticationError,
    TitmasClient,
    TitmasScopeError,
    TitmasTransportError,
)


def test_not_assessed_and_receipt_boundaries_are_preserved() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer synthetic-token"
        if request.url.path == "/api/v1/preflight":
            return httpx.Response(
                200,
                json={
                    "result": "NOT_ASSESSED",
                    "reason_codes": ["SCHEMA_NOT_SUPPORTED"],
                    "schema_name": None,
                    "schema_version": None,
                    "object_type": "UNKNOWN",
                    "formal_conformance": False,
                    "certification": False,
                    "truth_claim": False,
                    "authorization_effect": False,
                    "receipt": {"receipt_id": "synthetic"},
                    "idempotent_replay": False,
                },
            )
        if request.url.path == "/api/v1/receipts/verify":
            return httpx.Response(
                200,
                json={
                    "valid": True,
                    "reason_code": "TITMAS-RECEIPT-SIGNATURE-VALID",
                    "receipt_hash": "a" * 64,
                    "structure_only": True,
                    "chain_valid": "NOT_ASSESSED_SINGLE_RECEIPT",
                    "truth_verified": False,
                    "authorization_effect": False,
                },
            )
        return httpx.Response(404, json={"title": "not found"})

    with TitmasClient(
        credential="synthetic-token",
        transport=httpx.MockTransport(handler),
    ) as client:
        outcome = client.preflight(
            request_id="r1",
            idempotency_key="i1",
            tenant_id="t1",
            agent_identity="a1",
            object_value={"object_type": "UNKNOWN"},
        )
        assert outcome.result == "NOT_ASSESSED"
        assert outcome.formal_conformance is False
        assert outcome.truth_claim is False
        verification = client.verify_receipt(outcome.receipt)
        assert verification.valid is True
        assert verification.structure_only is True
        assert verification.truth_verified is False


def test_missing_credential_and_scope_failure_are_distinct() -> None:
    with TitmasClient(transport=httpx.MockTransport(lambda _: httpx.Response(500))) as client:
        with pytest.raises(TitmasAuthenticationError):
            client.catalog()

    def forbidden(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            403,
            json={
                "title": "Scope required",
                "reason_code": "TITMAS-COMMERCIAL-SCOPE_REQUIRED",
            },
        )

    with TitmasClient(
        credential="synthetic-token",
        transport=httpx.MockTransport(forbidden),
    ) as client:
        with pytest.raises(TitmasScopeError) as captured:
            client.catalog()
        assert captured.value.status_code == 403


def test_get_retries_but_post_is_never_automatically_retried() -> None:
    calls: dict[str, int] = {"GET": 0, "POST": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls[request.method] += 1
        if request.method == "GET" and calls["GET"] == 1:
            return httpx.Response(503, json={"title": "temporary"})
        if request.method == "GET":
            return httpx.Response(200, json={"operations": []})
        raise httpx.ReadTimeout("post-dispatch status unknown")

    with TitmasClient(
        credential="synthetic-token",
        transport=httpx.MockTransport(handler),
        get_retry_attempts=1,
    ) as client:
        assert client.capabilities() == {"operations": []}
        with pytest.raises(TitmasTransportError, match="outcome is unknown"):
            client.preflight(
                request_id="r1",
                idempotency_key="i1",
                tenant_id="t1",
                agent_identity="a1",
                object_value={},
            )
    assert calls == {"GET": 2, "POST": 1}
