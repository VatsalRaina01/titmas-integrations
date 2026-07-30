from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

Result = Literal["PASS", "FAIL", "NOT_ASSESSED"]


@dataclass(frozen=True, slots=True)
class PreflightOutcome:
    result: Result
    reason_codes: tuple[str, ...]
    schema_name: str | None
    schema_version: str | None
    object_type: str | None
    receipt: dict[str, Any]
    idempotent_replay: bool
    formal_conformance: bool
    certification: bool
    truth_claim: bool
    authorization_effect: bool


@dataclass(frozen=True, slots=True)
class ReceiptVerification:
    valid: bool
    reason_code: str
    receipt_hash: str | None
    structure_only: bool
    chain_valid: str
    truth_verified: bool
    authorization_effect: bool
