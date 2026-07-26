"""Immutable, provider-neutral phase trace contracts.

The module deliberately contains no HTTP client, retry loop, provider SDK,
DBOS writer, SAEE evaluator, persistence store, or authority mechanism.
PhaseTrace values are sanitized observations, not Evidence or Truth.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import re
from typing import Final, Sequence


SCHEMA_VERSION: Final = "0.1.0"
_SAFE_REFERENCE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")


class PhaseId(str, Enum):
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"
    P4 = "P4"
    P5 = "P5"
    P6 = "P6"
    P7 = "P7"
    P8 = "P8"
    P9 = "P9"


class PhaseStatus(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    NOT_EXECUTED_PREREQUISITE_FAILED = "NOT_EXECUTED_PREREQUISITE_FAILED"


class FailureCategory(str, Enum):
    NONE = "NONE"
    DNS_TIMEOUT = "DNS_TIMEOUT"
    TCP_CONNECT_TIMEOUT = "TCP_CONNECT_TIMEOUT"
    TLS_HANDSHAKE_TIMEOUT = "TLS_HANDSHAKE_TIMEOUT"
    HTTP_HEADERS_WRITE_TIMEOUT = "HTTP_HEADERS_WRITE_TIMEOUT"
    HTTP_BODY_WRITE_TIMEOUT = "HTTP_BODY_WRITE_TIMEOUT"
    HTTP_RESPONSE_HEADERS_TIMEOUT = "HTTP_RESPONSE_HEADERS_TIMEOUT"
    HTTP_RESPONSE_BODY_TIMEOUT = "HTTP_RESPONSE_BODY_TIMEOUT"
    HTTP_RESPONSE_TRUNCATED = "HTTP_RESPONSE_TRUNCATED"
    CONTENT_EXTRACTION_FAILURE = "CONTENT_EXTRACTION_FAILURE"
    RESPONSE_SCHEMA_FAILURE = "RESPONSE_SCHEMA_FAILURE"
    SANITIZED_HANDOFF_FAILURE = "SANITIZED_HANDOFF_FAILURE"
    BOUNDARY_VIOLATION = "BOUNDARY_VIOLATION"


PHASE_NAMES: Final = {
    PhaseId.P0: "DNS_RESOLUTION",
    PhaseId.P1: "TCP_CONNECT",
    PhaseId.P2: "TLS_HANDSHAKE",
    PhaseId.P3: "HTTP_REQUEST_HEADERS_WRITE",
    PhaseId.P4: "HTTP_REQUEST_BODY_WRITE",
    PhaseId.P5: "HTTP_RESPONSE_STATUS_AND_HEADERS",
    PhaseId.P6: "HTTP_RESPONSE_BODY",
    PhaseId.P7: "RESPONSE_CONTENT_EXTRACTION",
    PhaseId.P8: "RESPONSE_SCHEMA_VALIDATION",
    PhaseId.P9: "SANITIZED_RESULT_HANDOFF_COMMIT",
}
PHASE_ORDER: Final = tuple(PhaseId)
EXPECTED_PREDECESSOR: Final = {
    phase: (None if index == 0 else PHASE_ORDER[index - 1])
    for index, phase in enumerate(PHASE_ORDER)
}


def _nonnegative_number(name: str, value: int | float) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        raise ValueError(f"{name} must be a non-negative number")


def _nonnegative_integer(name: str, value: int) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{name} must be a non-negative integer")


def _optional_digest(name: str, value: str | None) -> None:
    if value is not None and not _SHA256.fullmatch(value):
        raise ValueError(f"{name} must be a lowercase SHA-256 digest")


@dataclass(frozen=True, slots=True)
class PhaseEvent:
    """One sanitized observation in the fixed P0-P9 phase sequence."""

    phase_id: PhaseId
    status: PhaseStatus
    started_at_monotonic_ref: str
    elapsed_ms: int | float
    timeout_budget_ms: int | float
    bytes_in: int
    bytes_out: int
    failure_category: FailureCategory
    predecessor_phase: PhaseId | None
    executed: bool
    observed_http_status: int | None = None
    observed_returned_model_identifier: str | None = None
    raw_envelope_sha256: str | None = None
    sanitized_result_sha256: str | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.phase_id, PhaseId):
            raise ValueError("phase_id must be PhaseId")
        if not isinstance(self.status, PhaseStatus):
            raise ValueError("status must be PhaseStatus")
        if not isinstance(self.failure_category, FailureCategory):
            raise ValueError("failure_category must be FailureCategory")
        if not _SAFE_REFERENCE.fullmatch(self.started_at_monotonic_ref):
            raise ValueError("started_at_monotonic_ref must be an opaque safe reference")
        _nonnegative_number("elapsed_ms", self.elapsed_ms)
        _nonnegative_number("timeout_budget_ms", self.timeout_budget_ms)
        _nonnegative_integer("bytes_in", self.bytes_in)
        _nonnegative_integer("bytes_out", self.bytes_out)
        if self.predecessor_phase is not EXPECTED_PREDECESSOR[self.phase_id]:
            raise ValueError("predecessor_phase does not match the fixed P0-P9 order")
        if not isinstance(self.executed, bool):
            raise ValueError("executed must be boolean")
        if self.status is PhaseStatus.PASS:
            if not self.executed or self.failure_category is not FailureCategory.NONE:
                raise ValueError("PASS requires executed=true and failure_category=NONE")
        elif self.status is PhaseStatus.FAIL:
            if not self.executed or self.failure_category is FailureCategory.NONE:
                raise ValueError("FAIL requires executed=true and a non-NONE failure category")
        else:
            if self.executed or self.failure_category is not FailureCategory.NONE:
                raise ValueError(
                    "NOT_EXECUTED requires executed=false and failure_category=NONE"
                )
        if self.observed_http_status is not None:
            if (
                isinstance(self.observed_http_status, bool)
                or not isinstance(self.observed_http_status, int)
                or not 100 <= self.observed_http_status <= 599
            ):
                raise ValueError("observed_http_status must be between 100 and 599")
        if self.observed_returned_model_identifier is not None:
            if not _SAFE_REFERENCE.fullmatch(self.observed_returned_model_identifier):
                raise ValueError(
                    "observed_returned_model_identifier must be a safe reference"
                )
        _optional_digest("raw_envelope_sha256", self.raw_envelope_sha256)
        _optional_digest("sanitized_result_sha256", self.sanitized_result_sha256)

    def to_dict(self) -> dict[str, object]:
        return {
            "phase_id": self.phase_id.value,
            "status": self.status.value,
            "started_at_monotonic_ref": self.started_at_monotonic_ref,
            "elapsed_ms": self.elapsed_ms,
            "timeout_budget_ms": self.timeout_budget_ms,
            "bytes_in": self.bytes_in,
            "bytes_out": self.bytes_out,
            "failure_category": self.failure_category.value,
            "predecessor_phase": (
                None if self.predecessor_phase is None else self.predecessor_phase.value
            ),
            "executed": self.executed,
            "observed_http_status": self.observed_http_status,
            "observed_returned_model_identifier": (
                self.observed_returned_model_identifier
            ),
            "raw_envelope_sha256": self.raw_envelope_sha256,
            "sanitized_result_sha256": self.sanitized_result_sha256,
        }


@dataclass(frozen=True, slots=True)
class PhaseTrace:
    """A complete immutable P0-P9 trace with at most one first failure."""

    events: tuple[PhaseEvent, ...]
    schema_version: str = field(default=SCHEMA_VERSION, init=False)

    def __post_init__(self) -> None:
        if not isinstance(self.events, tuple):
            raise ValueError("events must be an immutable tuple")
        validate_phase_trace(self)

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "events": [event.to_dict() for event in self.events],
        }


def validate_phase_trace(trace: PhaseTrace | Sequence[PhaseEvent]) -> None:
    """Raise ValueError unless a trace satisfies the fixed fail-closed contract."""

    events = trace.events if isinstance(trace, PhaseTrace) else tuple(trace)
    if len(events) != len(PHASE_ORDER):
        raise ValueError("a PhaseTrace must contain exactly P0-P9")
    if any(not isinstance(event, PhaseEvent) for event in events):
        raise ValueError("every trace member must be PhaseEvent")
    if tuple(event.phase_id for event in events) != PHASE_ORDER:
        raise ValueError("phase IDs must be complete, unique, and ordered P0-P9")

    failures = [
        index for index, event in enumerate(events) if event.status is PhaseStatus.FAIL
    ]
    if len(failures) > 1:
        raise ValueError("a PhaseTrace may contain only one first failure")
    if not failures:
        if any(event.status is not PhaseStatus.PASS for event in events):
            raise ValueError("a no-failure trace must contain only PASS events")
        return

    failure_index = failures[0]
    for index, event in enumerate(events):
        expected = (
            PhaseStatus.PASS
            if index < failure_index
            else (
                PhaseStatus.FAIL
                if index == failure_index
                else PhaseStatus.NOT_EXECUTED_PREREQUISITE_FAILED
            )
        )
        if event.status is not expected:
            raise ValueError("first failure must close every dependent phase")
