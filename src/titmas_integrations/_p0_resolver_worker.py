"""Private single-use P0 resolver child.

This module is deliberately not exported. The child emits one bounded,
canonical JSON message over a caller-owned pipe and exits. It never logs an
exception string or a hostname.
"""

from __future__ import annotations

import json
import os
import socket
from typing import Callable, Final, Iterable

try:
    import resource
except ImportError:  # pragma: no cover - import remains safe on non-POSIX hosts
    resource = None  # type: ignore[assignment]


IPC_PAYLOAD_BYTES_MAX: Final = 512
RAW_RESULT_COUNT_MAX: Final = 64
UNIQUE_USABLE_RESULT_COUNT_MAX: Final = 64
_ALLOWED_FAMILIES: Final = (socket.AF_INET, socket.AF_INET6)

Resolver = Callable[
    [str, int, socket.AddressFamily, socket.SocketKind, int, int],
    Iterable[tuple[int, int, int, str, tuple[object, ...]]],
]


def _failure(category: str, *, raw_count: int = 0, unique_count: int = 0) -> dict:
    return {
        "failure_category": category,
        "raw_result_count": raw_count,
        "status": "FAIL",
        "unique_usable_result_count": unique_count,
    }


def _canonical_payload(document: dict) -> bytes:
    payload = json.dumps(
        document,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("ascii")
    if len(payload) > IPC_PAYLOAD_BYTES_MAX:
        payload = json.dumps(
            _failure("DNS_IPC_BOUNDARY_VIOLATION"),
            separators=(",", ":"),
            sort_keys=True,
        ).encode("ascii")
    return payload


def _write_all(fd: int, payload: bytes) -> None:
    offset = 0
    while offset < len(payload):
        written = os.write(fd, payload[offset:])
        if written <= 0:
            return
        offset += written


def _close_inherited_fds_except(write_fd: int) -> bool:
    if resource is None:
        return False
    try:
        soft_limit, _hard_limit = resource.getrlimit(resource.RLIMIT_NOFILE)
        if soft_limit == resource.RLIM_INFINITY:
            soft_limit = 1_048_576
        upper = max(write_fd + 1, int(soft_limit))
        os.closerange(0, write_fd)
        os.closerange(write_fd + 1, upper)
    except (OSError, ValueError):
        return False
    return True


def _map_gaierror(exc: socket.gaierror) -> str:
    if exc.errno == getattr(socket, "EAI_NONAME", object()):
        return "DNS_NAME_NOT_FOUND"
    if exc.errno == getattr(socket, "EAI_AGAIN", object()):
        return "DNS_TEMPORARY_FAILURE"
    return "DNS_RESOLVER_ERROR"


def _normalize_sockaddr(
    family: int, sockaddr: tuple[object, ...]
) -> tuple[object, ...] | None:
    if family == socket.AF_INET:
        if (
            len(sockaddr) != 2
            or not isinstance(sockaddr[0], str)
            or sockaddr[1] != 443
        ):
            return None
        return (sockaddr[0], 443)
    if family == socket.AF_INET6:
        if (
            len(sockaddr) != 4
            or not isinstance(sockaddr[0], str)
            or sockaddr[1] != 443
            or not isinstance(sockaddr[2], int)
            or not isinstance(sockaddr[3], int)
        ):
            return None
        return (sockaddr[0], 443, sockaddr[2], sockaddr[3])
    return None


def build_worker_document(hostname: str, resolver: Resolver) -> dict:
    """Call one injected resolver and return a private bounded result document."""

    try:
        raw_results = list(
            resolver(
                hostname,
                443,
                socket.AF_UNSPEC,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                0,
            )
        )
    except socket.gaierror as exc:
        return _failure(_map_gaierror(exc))
    except BaseException:
        return _failure("DNS_RESOLVER_ERROR")

    raw_count = len(raw_results)
    if raw_count == 0:
        return _failure("DNS_EMPTY_RESULT")
    if raw_count > RAW_RESULT_COUNT_MAX:
        return _failure("DNS_RESULT_LIMIT_EXCEEDED", raw_count=raw_count)

    unique: list[tuple[int, int, int, tuple[object, ...]]] = []
    seen: set[tuple[int, int, int, tuple[object, ...]]] = set()
    for item in raw_results:
        if not isinstance(item, tuple) or len(item) != 5:
            continue
        family, socket_type, protocol, _canonname, sockaddr = item
        if (
            family not in _ALLOWED_FAMILIES
            or socket_type != socket.SOCK_STREAM
            or protocol != socket.IPPROTO_TCP
            or not isinstance(sockaddr, tuple)
        ):
            continue
        normalized = _normalize_sockaddr(family, sockaddr)
        if normalized is None:
            continue
        key = (family, socket_type, protocol, normalized)
        if key not in seen:
            seen.add(key)
            unique.append(key)

    unique_count = len(unique)
    if unique_count == 0:
        return _failure(
            "DNS_NO_USABLE_TCP_ADDRESS",
            raw_count=raw_count,
            unique_count=0,
        )
    if unique_count > UNIQUE_USABLE_RESULT_COUNT_MAX:
        return _failure(
            "DNS_RESULT_LIMIT_EXCEEDED",
            raw_count=raw_count,
            unique_count=unique_count,
        )

    family, socket_type, protocol, sockaddr = unique[0]
    return {
        "family": family,
        "failure_category": "NONE",
        "protocol": protocol,
        "raw_result_count": raw_count,
        "selected_sockaddr": list(sockaddr),
        "socket_type": socket_type,
        "status": "PASS",
        "unique_usable_result_count": unique_count,
    }


def worker_entry(write_fd: int, hostname: str, resolver: Resolver) -> None:
    """Run in one child process; emit one bounded payload and never return."""

    try:
        if not _close_inherited_fds_except(write_fd):
            _write_all(
                write_fd,
                _canonical_payload(_failure("DNS_BOUNDARY_VIOLATION")),
            )
            return
        os.environ.clear()
        payload = _canonical_payload(build_worker_document(hostname, resolver))
        _write_all(write_fd, payload)
    except BaseException:
        try:
            _write_all(
                write_fd,
                _canonical_payload(_failure("DNS_BOUNDARY_VIOLATION")),
            )
        except BaseException:
            pass
    finally:
        try:
            os.close(write_fd)
        except OSError:
            pass
