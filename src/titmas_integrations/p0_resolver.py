"""Bounded Development reference for P0 DNS resolution.

The public path performs one exact-hostname resolution in a single-use POSIX
child process. Unit tests use injected fork-safe fakes and perform no real DNS,
TCP, TLS, HTTP, Provider, DBOS, or SAEE operation.

P0 resolution is an execution capability, not Permission, Evidence, Truth,
provider support, or production readiness.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from enum import Enum
import hashlib
import importlib.resources
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import selectors
import signal
import socket
import threading
import time
from typing import Callable, Final, Iterable

from ._p0_resolver_worker import (
    IPC_PAYLOAD_BYTES_MAX,
    RAW_RESULT_COUNT_MAX,
    Resolver,
    UNIQUE_USABLE_RESULT_COUNT_MAX,
    worker_entry,
)


SCHEMA_VERSION: Final = "0.2.0"
POLICY_ID: Final = "GLOBAL_UNICAST_DESTINATION_PROFILE_V1"
SUCCESS_ADMISSION_DEADLINE_MS: Final = 5000
_CANONICAL_HOSTNAME = re.compile(
    r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+"
    r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$"
)
_ALLOWED_IPC_FIELDS: Final = frozenset(
    {
        "family",
        "failure_category",
        "protocol",
        "raw_result_count",
        "selected_sockaddr",
        "socket_type",
        "status",
        "unique_usable_result_count",
    }
)
_FAILURE_IPC_FIELDS: Final = frozenset(
    {
        "failure_category",
        "raw_result_count",
        "status",
        "unique_usable_result_count",
    }
)
_FORBIDDEN_IPC_MARKERS: Final = (
    "hostname",
    "exception",
    "credential",
    "authorization",
    "api_key",
    "token",
    "request_body",
    "response_body",
)


class ResolverFailureCategory(str, Enum):
    NONE = "NONE"
    DNS_TIMEOUT = "DNS_TIMEOUT"
    DNS_NAME_NOT_FOUND = "DNS_NAME_NOT_FOUND"
    DNS_TEMPORARY_FAILURE = "DNS_TEMPORARY_FAILURE"
    DNS_EMPTY_RESULT = "DNS_EMPTY_RESULT"
    DNS_RESULT_LIMIT_EXCEEDED = "DNS_RESULT_LIMIT_EXCEEDED"
    DNS_NO_USABLE_TCP_ADDRESS = "DNS_NO_USABLE_TCP_ADDRESS"
    DNS_RESOLVER_ERROR = "DNS_RESOLVER_ERROR"
    DNS_BOUNDARY_VIOLATION = "DNS_BOUNDARY_VIOLATION"
    DNS_WORKER_START_FAILURE = "DNS_WORKER_START_FAILURE"
    DNS_LATE_RESULT = "DNS_LATE_RESULT"
    DNS_WORKER_TERMINATION_UNCONFIRMED = "DNS_WORKER_TERMINATION_UNCONFIRMED"
    DNS_IPC_BOUNDARY_VIOLATION = "DNS_IPC_BOUNDARY_VIOLATION"
    DNS_DESTINATION_POLICY_REJECTED = "DNS_DESTINATION_POLICY_REJECTED"
    DNS_DESTINATION_POLICY_UNAVAILABLE = "DNS_DESTINATION_POLICY_UNAVAILABLE"
    DNS_UNSUPPORTED_PLATFORM = "DNS_UNSUPPORTED_PLATFORM"
    DNS_UNSUPPORTED_EXECUTION_CONTEXT = "DNS_UNSUPPORTED_EXECUTION_CONTEXT"


@dataclass(frozen=True, slots=True)
class P0ResolverObservation:
    """Sanitized P0 observation; never contains hostname or numeric address."""

    status: str
    elapsed_ms: float
    raw_result_count: int
    unique_usable_result_count: int
    selected_address_family: str | None
    failure_category: ResolverFailureCategory
    resolution_handle_ref: str | None
    resolver_worker_receipt_ref: str
    executed: bool
    timeout_budget_ms: int = field(
        default=SUCCESS_ADMISSION_DEADLINE_MS, init=False
    )
    phase_id: str = field(default="P0", init=False)
    schema_version: str = field(default=SCHEMA_VERSION, init=False)

    def __post_init__(self) -> None:
        if self.status not in {"PASS", "FAIL"}:
            raise ValueError("status must be PASS or FAIL")
        if self.elapsed_ms < 0:
            raise ValueError("elapsed_ms must be non-negative")
        if self.raw_result_count < 0 or self.unique_usable_result_count < 0:
            raise ValueError("result counts must be non-negative")
        if self.status == "PASS":
            if (
                self.failure_category is not ResolverFailureCategory.NONE
                or self.selected_address_family not in {"AF_INET", "AF_INET6"}
                or self.resolution_handle_ref is None
                or not self.executed
            ):
                raise ValueError("PASS requires a sanitized selected endpoint")
        elif self.failure_category is ResolverFailureCategory.NONE:
            raise ValueError("FAIL requires a non-NONE failure category")

    def to_dict(self) -> dict[str, object]:
        return {
            "elapsed_ms": self.elapsed_ms,
            "executed": self.executed,
            "failure_category": self.failure_category.value,
            "phase_id": self.phase_id,
            "raw_result_count": self.raw_result_count,
            "resolution_handle_ref": self.resolution_handle_ref,
            "resolver_worker_receipt_ref": self.resolver_worker_receipt_ref,
            "schema_version": self.schema_version,
            "selected_address_family": self.selected_address_family,
            "status": self.status,
            "timeout_budget_ms": self.timeout_budget_ms,
            "unique_usable_result_count": self.unique_usable_result_count,
        }


class EndpointBinding:
    """Transient P0-to-P2 endpoint binding with redacted representation."""

    __slots__ = (
        "_destination_policy_id",
        "_destination_policy_snapshot_sha256",
        "_family",
        "_original_hostname",
        "_port",
        "_protocol",
        "_resolution_handle_ref",
        "_resolved_at_monotonic_ns",
        "_resolver_worker_receipt_ref",
        "_selected_sockaddr",
        "_socket_type",
        "_success_admission_deadline_monotonic_ns",
        "_sealed",
    )

    def __init__(
        self,
        *,
        original_hostname: str,
        family: int,
        socket_type: int,
        protocol: int,
        selected_sockaddr: tuple[object, ...],
        resolution_handle_ref: str,
        resolver_worker_receipt_ref: str,
        destination_policy_snapshot_sha256: str,
        resolved_at_monotonic_ns: int,
        success_admission_deadline_monotonic_ns: int,
    ) -> None:
        object.__setattr__(self, "_sealed", False)
        object.__setattr__(self, "_original_hostname", original_hostname)
        object.__setattr__(self, "_port", 443)
        object.__setattr__(self, "_family", family)
        object.__setattr__(self, "_socket_type", socket_type)
        object.__setattr__(self, "_protocol", protocol)
        object.__setattr__(self, "_selected_sockaddr", selected_sockaddr)
        object.__setattr__(self, "_resolution_handle_ref", resolution_handle_ref)
        object.__setattr__(
            self, "_resolver_worker_receipt_ref", resolver_worker_receipt_ref
        )
        object.__setattr__(self, "_destination_policy_id", POLICY_ID)
        object.__setattr__(
            self,
            "_destination_policy_snapshot_sha256",
            destination_policy_snapshot_sha256,
        )
        object.__setattr__(
            self, "_resolved_at_monotonic_ns", resolved_at_monotonic_ns
        )
        object.__setattr__(
            self,
            "_success_admission_deadline_monotonic_ns",
            success_admission_deadline_monotonic_ns,
        )
        object.__setattr__(self, "_sealed", True)

    def __setattr__(self, name: str, value: object) -> None:
        if getattr(self, "_sealed", False):
            raise AttributeError("EndpointBinding is immutable")
        object.__setattr__(self, name, value)

    def __repr__(self) -> str:
        return (
            "<EndpointBinding redacted "
            f"family={self.family_name} policy={self._destination_policy_id}>"
        )

    def __copy__(self) -> "EndpointBinding":
        raise TypeError("EndpointBinding cannot be copied")

    def __deepcopy__(self, memo: dict) -> "EndpointBinding":
        raise TypeError("EndpointBinding cannot be deep-copied")

    def __reduce_ex__(self, protocol: int) -> object:
        raise TypeError("EndpointBinding cannot be serialized")

    @property
    def original_hostname(self) -> str:
        return self._original_hostname

    @property
    def port(self) -> int:
        return self._port

    @property
    def family(self) -> int:
        return self._family

    @property
    def family_name(self) -> str:
        return "AF_INET" if self._family == socket.AF_INET else "AF_INET6"

    @property
    def socket_type(self) -> int:
        return self._socket_type

    @property
    def protocol(self) -> int:
        return self._protocol

    @property
    def selected_sockaddr(self) -> tuple[object, ...]:
        return self._selected_sockaddr

    @property
    def resolution_handle_ref(self) -> str:
        return self._resolution_handle_ref

    @property
    def resolver_worker_receipt_ref(self) -> str:
        return self._resolver_worker_receipt_ref

    @property
    def destination_policy_id(self) -> str:
        return self._destination_policy_id

    @property
    def destination_policy_snapshot_sha256(self) -> str:
        return self._destination_policy_snapshot_sha256


@dataclass(frozen=True, slots=True)
class P0ResolverResult:
    observation: P0ResolverObservation
    endpoint_binding: EndpointBinding | None

    def __post_init__(self) -> None:
        if (self.observation.status == "PASS") is (self.endpoint_binding is None):
            raise ValueError("PASS requires binding; FAIL forbids binding")


@dataclass(frozen=True, slots=True)
class _PolicyEntry:
    network: ipaddress.IPv4Network | ipaddress.IPv6Network
    destination: str
    globally_reachable: str


@dataclass(frozen=True, slots=True)
class _DestinationPolicy:
    snapshot_sha256: str
    entries: tuple[_PolicyEntry, ...]


def _canonical_hostname(value: str) -> bool:
    if not isinstance(value, str) or not _CANONICAL_HOSTNAME.fullmatch(value):
        return False
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return True
    return False


def _validate_input(hostname: str, allowed_hostnames: frozenset[str]) -> None:
    if not _canonical_hostname(hostname):
        raise ValueError("hostname must be canonical lowercase ASCII, not an IP literal")
    if not isinstance(allowed_hostnames, frozenset):
        raise ValueError("allowed_hostnames must be an immutable frozenset")
    if not allowed_hostnames or any(
        not _canonical_hostname(item) for item in allowed_hostnames
    ):
        raise ValueError("allowlist members must be canonical lowercase ASCII")
    if hostname not in allowed_hostnames:
        raise ValueError("hostname is not in the exact allowlist")


def _extract_networks(
    value: str,
) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    tokens = re.findall(
        r"(?:(?:\d{1,3}\.){3}\d{1,3}/\d{1,2}|[0-9A-Fa-f:]+/\d{1,3})",
        value,
    )
    return tuple(ipaddress.ip_network(token, strict=False) for token in tokens)


def _read_policy_bytes(data_root: Path | None, name: str) -> bytes:
    if data_root is not None:
        return (data_root / name).read_bytes()
    resource = importlib.resources.files("titmas_integrations.data").joinpath(name)
    return resource.read_bytes()


def _load_destination_policy(data_root: Path | None = None) -> _DestinationPolicy:
    try:
        manifest_bytes = _read_policy_bytes(
            data_root, "global-unicast-destination-policy.v1.json"
        )
        manifest = json.loads(manifest_bytes)
        if (
            manifest.get("policy_id") != POLICY_ID
            or manifest.get("status") != "DEVELOPMENT_REFERENCE_INPUT"
            or manifest.get("source_last_updated") != "2025-10-09"
            or manifest.get("license") != "CC0-1.0"
        ):
            raise ValueError("policy metadata mismatch")
        entries: list[_PolicyEntry] = []
        snapshot_hash = hashlib.sha256()
        expected_urls = {
            "ipv4": "https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry-1.csv",
            "ipv6": "https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry-1.csv",
        }
        for family in ("ipv4", "ipv6"):
            descriptor = manifest[family]
            if descriptor.get("url") != expected_urls[family]:
                raise ValueError("snapshot source URL mismatch")
            raw = _read_policy_bytes(data_root, descriptor["path"])
            if len(raw) != descriptor["bytes"]:
                raise ValueError("snapshot byte count mismatch")
            digest = hashlib.sha256(raw).hexdigest()
            if digest != descriptor["sha256"]:
                raise ValueError("snapshot digest mismatch")
            snapshot_hash.update(bytes.fromhex(digest))
            for row in csv.DictReader(raw.decode("utf-8-sig").splitlines()):
                for network in _extract_networks(row["Address Block"]):
                    entries.append(
                        _PolicyEntry(
                            network=network,
                            destination=row["Destination"].strip(),
                            globally_reachable=row["Globally Reachable"].strip(),
                        )
                    )
        return _DestinationPolicy(
            snapshot_sha256=snapshot_hash.hexdigest(),
            entries=tuple(entries),
        )
    except (KeyError, OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("destination policy unavailable") from None


def _destination_allowed(
    address: str, family: int, policy: _DestinationPolicy
) -> bool:
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError:
        return False
    if family == socket.AF_INET and parsed.version != 4:
        return False
    if family == socket.AF_INET6 and parsed.version != 6:
        return False
    if (
        parsed.is_unspecified
        or parsed.is_loopback
        or parsed.is_link_local
        or parsed.is_multicast
        or parsed.is_reserved
    ):
        return False
    matches = [
        entry
        for entry in policy.entries
        if entry.network.version == parsed.version and parsed in entry.network
    ]
    if not matches:
        return True
    match = max(matches, key=lambda entry: entry.network.prefixlen)
    return match.destination == "True" and match.globally_reachable == "True"


def _safe_ref(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(16)}"


def _elapsed_ms(start_ns: int, end_ns: int) -> float:
    return round(max(0, end_ns - start_ns) / 1_000_000, 3)


def _failure_result(
    category: ResolverFailureCategory,
    *,
    start_ns: int,
    now_ns: int,
    receipt_ref: str,
    executed: bool,
    raw_count: int = 0,
    unique_count: int = 0,
) -> P0ResolverResult:
    return P0ResolverResult(
        observation=P0ResolverObservation(
            status="FAIL",
            elapsed_ms=_elapsed_ms(start_ns, now_ns),
            raw_result_count=raw_count,
            unique_usable_result_count=unique_count,
            selected_address_family=None,
            failure_category=category,
            resolution_handle_ref=None,
            resolver_worker_receipt_ref=receipt_ref,
            executed=executed,
        ),
        endpoint_binding=None,
    )


def _terminate_and_reap(pid: int) -> bool:
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except OSError:
        return False
    try:
        waited, _status = os.waitpid(pid, 0)
    except (ChildProcessError, OSError):
        return False
    return waited == pid


def _decode_worker_payload(payload: bytes) -> dict:
    if not payload or len(payload) > IPC_PAYLOAD_BYTES_MAX:
        raise ValueError("invalid IPC length")
    lowered = payload.lower()
    if any(marker.encode("ascii") in lowered for marker in _FORBIDDEN_IPC_MARKERS):
        raise ValueError("forbidden IPC field")
    try:
        document = json.loads(payload.decode("ascii"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ValueError("invalid IPC JSON") from None
    if not isinstance(document, dict) or set(document) not in {
        _ALLOWED_IPC_FIELDS,
        _FAILURE_IPC_FIELDS,
    }:
        raise ValueError("invalid IPC shape")
    if document.get("status") not in {"PASS", "FAIL"}:
        raise ValueError("invalid IPC status")
    if (
        not isinstance(document.get("raw_result_count"), int)
        or not isinstance(document.get("unique_usable_result_count"), int)
        or document["raw_result_count"] < 0
        or document["unique_usable_result_count"] < 0
    ):
        raise ValueError("invalid IPC result counts")
    if document["status"] == "FAIL":
        ResolverFailureCategory(document["failure_category"])
        if document["failure_category"] == "NONE":
            raise ValueError("FAIL cannot use NONE")
        if (
            document["raw_result_count"] > RAW_RESULT_COUNT_MAX
            or document["unique_usable_result_count"]
            > UNIQUE_USABLE_RESULT_COUNT_MAX
        ) and document["failure_category"] != "DNS_RESULT_LIMIT_EXCEEDED":
            raise ValueError("oversized counts require result-limit failure")
        return document
    if (
        document["raw_result_count"] > RAW_RESULT_COUNT_MAX
        or document["unique_usable_result_count"]
        > UNIQUE_USABLE_RESULT_COUNT_MAX
    ):
        raise ValueError("PASS result counts exceed limits")
    if document.get("failure_category") != "NONE":
        raise ValueError("PASS requires NONE")
    if document.get("family") not in {socket.AF_INET, socket.AF_INET6}:
        raise ValueError("invalid family")
    if document.get("socket_type") != socket.SOCK_STREAM:
        raise ValueError("invalid socket type")
    if document.get("protocol") != socket.IPPROTO_TCP:
        raise ValueError("invalid protocol")
    sockaddr = document.get("selected_sockaddr")
    if not isinstance(sockaddr, list):
        raise ValueError("selected_sockaddr must be one address")
    expected_length = 2 if document["family"] == socket.AF_INET else 4
    if len(sockaddr) != expected_length or sockaddr[1] != 443:
        raise ValueError("invalid selected sockaddr")
    if not isinstance(sockaddr[0], str):
        raise ValueError("invalid selected address")
    if expected_length == 4 and not all(isinstance(value, int) for value in sockaddr[2:]):
        raise ValueError("invalid IPv6 sockaddr")
    return document


def _collect_child_payload(
    pid: int,
    read_fd: int,
    deadline_ns: int,
    clock_ns: Callable[[], int],
) -> tuple[bytes | None, ResolverFailureCategory | None, int]:
    data = bytearray()
    selector = selectors.DefaultSelector()
    selector.register(read_fd, selectors.EVENT_READ)
    reaped = False
    child_status = 0
    try:
        while True:
            now_ns = clock_ns()
            if now_ns >= deadline_ns:
                confirmed = reaped or _terminate_and_reap(pid)
                return (
                    None,
                    (
                        ResolverFailureCategory.DNS_LATE_RESULT
                        if confirmed
                        else ResolverFailureCategory.DNS_WORKER_TERMINATION_UNCONFIRMED
                    ),
                    now_ns,
                )

            if not reaped:
                try:
                    waited, child_status = os.waitpid(pid, os.WNOHANG)
                except ChildProcessError:
                    return (
                        None,
                        ResolverFailureCategory.DNS_WORKER_TERMINATION_UNCONFIRMED,
                        clock_ns(),
                    )
                reaped = waited == pid
            events = selector.select(max(0, deadline_ns - now_ns) / 1_000_000_000)
            if events:
                chunk = os.read(
                    read_fd,
                    IPC_PAYLOAD_BYTES_MAX + 1 - len(data),
                )
                if chunk:
                    data.extend(chunk)
                    if len(data) > IPC_PAYLOAD_BYTES_MAX:
                        confirmed = _terminate_and_reap(pid) if not reaped else True
                        return (
                            None,
                            (
                                ResolverFailureCategory.DNS_IPC_BOUNDARY_VIOLATION
                                if confirmed
                                else ResolverFailureCategory.DNS_WORKER_TERMINATION_UNCONFIRMED
                            ),
                            clock_ns(),
                        )
                elif reaped:
                    break
            elif reaped:
                break
        if not reaped:
            waited, child_status = os.waitpid(pid, 0)
            if waited != pid:
                return (
                    None,
                    ResolverFailureCategory.DNS_WORKER_TERMINATION_UNCONFIRMED,
                    clock_ns(),
                )
        if not os.WIFEXITED(child_status) or os.WEXITSTATUS(child_status) != 0:
            return (
                None,
                ResolverFailureCategory.DNS_BOUNDARY_VIOLATION,
                clock_ns(),
            )
        return bytes(data), None, clock_ns()
    finally:
        selector.close()


def _resolve_endpoint_with_worker(
    hostname: str,
    allowed_hostnames: frozenset[str],
    *,
    resolver: Resolver,
    deadline_ms: int,
    clock_ns: Callable[[], int] = time.monotonic_ns,
    child_entry: Callable[[int, str, Resolver], None] = worker_entry,
    data_root: Path | None = None,
) -> P0ResolverResult:
    _validate_input(hostname, allowed_hostnames)
    start_ns = clock_ns()
    deadline_ns = start_ns + deadline_ms * 1_000_000
    receipt_ref = _safe_ref("worker")

    if os.name != "posix" or not hasattr(os, "fork") or not hasattr(os, "waitpid"):
        return _failure_result(
            ResolverFailureCategory.DNS_UNSUPPORTED_PLATFORM,
            start_ns=start_ns,
            now_ns=clock_ns(),
            receipt_ref=receipt_ref,
            executed=False,
        )
    if threading.active_count() != 1:
        return _failure_result(
            ResolverFailureCategory.DNS_UNSUPPORTED_EXECUTION_CONTEXT,
            start_ns=start_ns,
            now_ns=clock_ns(),
            receipt_ref=receipt_ref,
            executed=False,
        )

    try:
        read_fd, write_fd = os.pipe()
    except OSError:
        return _failure_result(
            ResolverFailureCategory.DNS_WORKER_START_FAILURE,
            start_ns=start_ns,
            now_ns=clock_ns(),
            receipt_ref=receipt_ref,
            executed=False,
        )
    try:
        try:
            pid = os.fork()
        except OSError:
            return _failure_result(
                ResolverFailureCategory.DNS_WORKER_START_FAILURE,
                start_ns=start_ns,
                now_ns=clock_ns(),
                receipt_ref=receipt_ref,
                executed=False,
            )
        if pid == 0:
            try:
                os.close(read_fd)
                child_entry(write_fd, hostname, resolver)
            finally:
                os._exit(0)

        os.close(write_fd)
        write_fd = -1
        payload, collection_failure, completed_ns = _collect_child_payload(
            pid, read_fd, deadline_ns, clock_ns
        )
        if collection_failure is not None:
            category = (
                ResolverFailureCategory.DNS_TIMEOUT
                if collection_failure is ResolverFailureCategory.DNS_LATE_RESULT
                else collection_failure
            )
            return _failure_result(
                category,
                start_ns=start_ns,
                now_ns=completed_ns,
                receipt_ref=receipt_ref,
                executed=True,
            )
        if completed_ns > deadline_ns:
            return _failure_result(
                ResolverFailureCategory.DNS_LATE_RESULT,
                start_ns=start_ns,
                now_ns=completed_ns,
                receipt_ref=receipt_ref,
                executed=True,
            )
        try:
            document = _decode_worker_payload(payload or b"")
        except ValueError:
            return _failure_result(
                ResolverFailureCategory.DNS_IPC_BOUNDARY_VIOLATION,
                start_ns=start_ns,
                now_ns=completed_ns,
                receipt_ref=receipt_ref,
                executed=True,
            )

        raw_count = document["raw_result_count"]
        unique_count = document["unique_usable_result_count"]
        if document["status"] == "FAIL":
            return _failure_result(
                ResolverFailureCategory(document["failure_category"]),
                start_ns=start_ns,
                now_ns=completed_ns,
                receipt_ref=receipt_ref,
                executed=True,
                raw_count=raw_count,
                unique_count=unique_count,
            )

        try:
            policy = _load_destination_policy(data_root)
        except ValueError:
            return _failure_result(
                ResolverFailureCategory.DNS_DESTINATION_POLICY_UNAVAILABLE,
                start_ns=start_ns,
                now_ns=completed_ns,
                receipt_ref=receipt_ref,
                executed=True,
                raw_count=raw_count,
                unique_count=unique_count,
            )
        family = document["family"]
        sockaddr = tuple(document["selected_sockaddr"])
        if not _destination_allowed(sockaddr[0], family, policy):
            return _failure_result(
                ResolverFailureCategory.DNS_DESTINATION_POLICY_REJECTED,
                start_ns=start_ns,
                now_ns=completed_ns,
                receipt_ref=receipt_ref,
                executed=True,
                raw_count=raw_count,
                unique_count=unique_count,
            )

        handle_ref = _safe_ref("resolution")
        binding = EndpointBinding(
            original_hostname=hostname,
            family=family,
            socket_type=document["socket_type"],
            protocol=document["protocol"],
            selected_sockaddr=sockaddr,
            resolution_handle_ref=handle_ref,
            resolver_worker_receipt_ref=receipt_ref,
            destination_policy_snapshot_sha256=policy.snapshot_sha256,
            resolved_at_monotonic_ns=completed_ns,
            success_admission_deadline_monotonic_ns=deadline_ns,
        )
        observation = P0ResolverObservation(
            status="PASS",
            elapsed_ms=_elapsed_ms(start_ns, completed_ns),
            raw_result_count=raw_count,
            unique_usable_result_count=unique_count,
            selected_address_family=binding.family_name,
            failure_category=ResolverFailureCategory.NONE,
            resolution_handle_ref=handle_ref,
            resolver_worker_receipt_ref=receipt_ref,
            executed=True,
        )
        return P0ResolverResult(observation=observation, endpoint_binding=binding)
    finally:
        try:
            os.close(read_fd)
        except OSError:
            pass
        if write_fd >= 0:
            try:
                os.close(write_fd)
            except OSError:
                pass


def resolve_endpoint(
    hostname: str, allowed_hostnames: frozenset[str]
) -> P0ResolverResult:
    """Resolve one exact hostname under the frozen Development P0 profile.

    The call may use the operating-system resolver. It performs no retry,
    fallback, Provider request, TCP connect, TLS handshake, HTTP request,
    persistence, DBOS write, or SAEE evaluation.
    """

    return _resolve_endpoint_with_worker(
        hostname,
        allowed_hostnames,
        resolver=socket.getaddrinfo,
        deadline_ms=SUCCESS_ADMISSION_DEADLINE_MS,
    )


def validate_endpoint_continuity(
    binding: EndpointBinding,
    *,
    p1_binding: EndpointBinding,
    p1_resolver_calls: int,
    p1_connect_calls: int,
    p1_alternate_attempts: int,
    p1_sockaddr: tuple[object, ...],
    p2_server_hostname: str,
) -> None:
    """Validate an offline P0-to-P2 consumption record; execute nothing."""

    if not isinstance(binding, EndpointBinding) or p1_binding is not binding:
        raise ValueError("P1 must consume the same EndpointBinding object")
    if p1_resolver_calls != 0:
        raise ValueError("P1 must not resolve again")
    if p1_connect_calls != 1:
        raise ValueError("P1 must make exactly one connect attempt")
    if p1_alternate_attempts != 0:
        raise ValueError("P1 fallback or alternate address is forbidden")
    if p1_sockaddr != binding.selected_sockaddr:
        raise ValueError("P1 must use the exact P0 selected sockaddr")
    if p2_server_hostname != binding.original_hostname:
        raise ValueError("P2 must verify the original exact hostname")
