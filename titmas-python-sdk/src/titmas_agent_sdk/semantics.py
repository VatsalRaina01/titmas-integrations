from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, cast

from titmas_api_client.models.preflight_result import PreflightResult
from titmas_api_client.models.receipt_verification import ReceiptVerification

ResultValue = Literal["PASS", "FAIL", "NOT_ASSESSED"]


class TitmasContractError(RuntimeError):
    """The generated transport returned a value outside TITMAS v1 semantics."""

    def __init__(self, message: str, *, reason_code: str) -> None:
        super().__init__(message)
        self.reason_code = reason_code


@dataclass(frozen=True, slots=True)
class BoundedPreflightOutcome:
    result: ResultValue
    reason_codes: tuple[str, ...]
    receipt_id: str
    request_id: str
    schema_id: str | None
    schema_version: str | None
    completed_at: str
    formal_conformance: Literal[False] = False
    certification: Literal[False] = False
    truth_claim: Literal[False] = False
    authorization_effect: Literal[False] = False


@dataclass(frozen=True, slots=True)
class BoundedReceiptVerification:
    valid: bool
    verification_status: str
    reason_codes: tuple[str, ...]
    structure_only: Literal[True] = True
    truth_verified: Literal[False] = False
    authorization_effect: Literal[False] = False


def bound_preflight(value: PreflightResult) -> BoundedPreflightOutcome:
    result = _enum_value(value.result)
    if result not in {"PASS", "FAIL", "NOT_ASSESSED"}:
        raise TitmasContractError(
            f"unknown result value: {result}",
            reason_code="RESULT_SEMANTICS_VIOLATION",
        )
    return BoundedPreflightOutcome(
        result=cast(ResultValue, result),
        reason_codes=tuple(_enum_value(code) for code in value.reason_codes),
        receipt_id=str(value.receipt_id),
        request_id=value.request_id,
        schema_id=value.schema_id,
        schema_version=value.schema_version,
        completed_at=value.completed_at.isoformat(),
    )


def bound_receipt_verification(value: ReceiptVerification) -> BoundedReceiptVerification:
    status = _enum_value(value.verification_status)
    if status not in {
        "VALID",
        "INVALID_SIGNATURE",
        "UNVERIFIABLE_KEY_UNAVAILABLE",
        "CHAIN_INVALID",
        "STRUCTURE_INVALID",
        "NOT_ASSESSED",
    }:
        raise TitmasContractError(
            f"unknown Receipt verification status: {status}",
            reason_code="RECEIPT_SEMANTICS_VIOLATION",
        )
    return BoundedReceiptVerification(
        valid=value.valid,
        verification_status=status,
        reason_codes=tuple(_enum_value(code) for code in value.reason_codes),
    )


def _enum_value(value: object) -> str:
    raw = getattr(value, "value", value)
    if not isinstance(raw, str):
        raise TitmasContractError(
            "generated model returned a non-string enum value",
            reason_code="RESULT_SEMANTICS_VIOLATION",
        )
    return raw
