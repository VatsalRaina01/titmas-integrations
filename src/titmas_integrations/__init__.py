"""Public Development API for provider-neutral TITMAS phase traces.

This package records sanitized observations. It does not perform network
requests, create Evidence, grant Permission, or execute DBOS/SAEE behavior.
"""

from .instrumentation import (
    FailureCategory,
    PhaseEvent,
    PhaseId,
    PhaseStatus,
    PhaseTrace,
    validate_phase_trace,
)

__all__ = [
    "FailureCategory",
    "PhaseEvent",
    "PhaseId",
    "PhaseStatus",
    "PhaseTrace",
    "validate_phase_trace",
]
