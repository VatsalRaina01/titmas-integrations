from __future__ import annotations

from typing import Any


class TitmasApiError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        reason_code: str | None = None,
        response: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.reason_code = reason_code
        self.response = response


class TitmasAuthenticationError(TitmasApiError):
    pass


class TitmasScopeError(TitmasApiError):
    pass


class TitmasQuotaError(TitmasApiError):
    pass


class TitmasTransportError(TitmasApiError):
    """Transport outcome is unknown; callers must not assume non-dispatch."""
