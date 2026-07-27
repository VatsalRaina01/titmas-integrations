"""Public Development API for bounded provider-neutral TITMAS contracts.

The P0 resolver is an explicit Development network-capable boundary. It does
not connect TCP, perform TLS/HTTP, create Evidence, grant Permission, bind a
Provider, or execute DBOS/SAEE behavior.
"""

from .instrumentation import (
    FailureCategory,
    PhaseEvent,
    PhaseId,
    PhaseStatus,
    PhaseTrace,
    validate_phase_trace,
)
from .p0_resolver import (
    EndpointBinding,
    P0ResolverObservation,
    P0ResolverResult,
    ResolverFailureCategory,
    resolve_endpoint,
    validate_endpoint_continuity,
)

__all__ = [
    "FailureCategory",
    "PhaseEvent",
    "PhaseId",
    "PhaseStatus",
    "PhaseTrace",
    "validate_phase_trace",
]
