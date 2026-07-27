import json
import os
import socket
import time
import unittest
from unittest import mock

from titmas_integrations import ResolverFailureCategory
import titmas_integrations.p0_resolver as resolver_module
from titmas_integrations.p0_resolver import _resolve_endpoint_with_worker


HOST = "api.example.com"
ALLOWLIST = frozenset({HOST})


def normal_resolver(*args):
    return [
        (
            socket.AF_INET,
            socket.SOCK_STREAM,
            socket.IPPROTO_TCP,
            "",
            ("192.31.196.1", 443),
        )
    ]


def raw_child(payload: bytes, *, delay: float = 0, exit_code: int = 0):
    def entry(write_fd, hostname, resolver):
        if delay:
            time.sleep(delay)
        os.write(write_fd, payload)
        os.close(write_fd)
        if exit_code:
            os._exit(exit_code)

    return entry


def run_child(entry, *, deadline_ms=200):
    return _resolve_endpoint_with_worker(
        HOST,
        ALLOWLIST,
        resolver=normal_resolver,
        deadline_ms=deadline_ms,
        child_entry=entry,
    )


class P0ResolverDeadlineTests(unittest.TestCase):
    def test_worker_start_failure_fails_closed(self):
        for operation in ("pipe", "fork"):
            with self.subTest(operation=operation):
                with mock.patch.object(
                    resolver_module.os, operation, side_effect=OSError
                ):
                    result = run_child(raw_child(b"{}"))
                self.assertEqual(
                    result.observation.failure_category,
                    ResolverFailureCategory.DNS_WORKER_START_FAILURE,
                )
                self.assertFalse(result.observation.executed)

    def test_timeout_kills_and_reaps_child(self):
        result = run_child(raw_child(b"{}", delay=1), deadline_ms=20)
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_TIMEOUT,
        )
        self.assertIsNone(result.endpoint_binding)

    def test_late_result_is_not_admitted(self):
        success = json.dumps(
            {
                "family": socket.AF_INET,
                "failure_category": "NONE",
                "protocol": socket.IPPROTO_TCP,
                "raw_result_count": 1,
                "selected_sockaddr": ["192.31.196.1", 443],
                "socket_type": socket.SOCK_STREAM,
                "status": "PASS",
                "unique_usable_result_count": 1,
            },
            separators=(",", ":"),
        ).encode()
        result = run_child(raw_child(success, delay=0.05), deadline_ms=10)
        self.assertNotEqual(result.observation.status, "PASS")
        self.assertIsNone(result.endpoint_binding)

    def test_unconfirmed_termination_fails_closed(self):
        original = resolver_module._terminate_and_reap

        def terminate_but_report_unconfirmed(pid):
            original(pid)
            return False

        with mock.patch.object(
            resolver_module,
            "_terminate_and_reap",
            side_effect=terminate_but_report_unconfirmed,
        ):
            result = run_child(raw_child(b"{}", delay=1), deadline_ms=20)
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_WORKER_TERMINATION_UNCONFIRMED,
        )

    def test_worker_exit_without_payload_fails_closed(self):
        result = run_child(raw_child(b""))
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_IPC_BOUNDARY_VIOLATION,
        )

    def test_abnormal_child_exit_fails_closed(self):
        result = run_child(raw_child(b"", exit_code=9))
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_BOUNDARY_VIOLATION,
        )

    def test_ipc_payload_over_512_bytes_fails_closed(self):
        result = run_child(raw_child(b"x" * 513))
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_IPC_BOUNDARY_VIOLATION,
        )

    def test_malformed_json_fails_closed(self):
        result = run_child(raw_child(b"{"))
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_IPC_BOUNDARY_VIOLATION,
        )

    def test_unknown_ipc_field_fails_closed(self):
        payload = json.dumps(
            {
                "failure_category": "DNS_EMPTY_RESULT",
                "raw_result_count": 0,
                "status": "FAIL",
                "unique_usable_result_count": 0,
                "unknown": 1,
            },
            separators=(",", ":"),
        ).encode()
        result = run_child(raw_child(payload))
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_IPC_BOUNDARY_VIOLATION,
        )

    def test_more_than_one_selected_address_fails_closed(self):
        payload = json.dumps(
            {
                "family": socket.AF_INET,
                "failure_category": "NONE",
                "protocol": socket.IPPROTO_TCP,
                "raw_result_count": 2,
                "selected_sockaddr": [
                    ["192.31.196.1", 443],
                    ["192.31.196.2", 443],
                ],
                "socket_type": socket.SOCK_STREAM,
                "status": "PASS",
                "unique_usable_result_count": 2,
            },
            separators=(",", ":"),
        ).encode()
        result = run_child(raw_child(payload))
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_IPC_BOUNDARY_VIOLATION,
        )

    def test_hostname_in_ipc_fails_closed(self):
        payload = json.dumps(
            {
                "failure_category": "DNS_EMPTY_RESULT",
                "hostname": HOST,
                "raw_result_count": 0,
                "status": "FAIL",
                "unique_usable_result_count": 0,
            },
            separators=(",", ":"),
        ).encode()
        result = run_child(raw_child(payload))
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_IPC_BOUNDARY_VIOLATION,
        )

    def test_exception_string_in_ipc_fails_closed(self):
        payload = json.dumps(
            {
                "exception": "sensitive",
                "failure_category": "DNS_RESOLVER_ERROR",
                "raw_result_count": 0,
                "status": "FAIL",
                "unique_usable_result_count": 0,
            },
            separators=(",", ":"),
        ).encode()
        result = run_child(raw_child(payload))
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_IPC_BOUNDARY_VIOLATION,
        )

    def test_no_absolute_total_wall_clock_claim_in_public_docs(self):
        from pathlib import Path

        root = Path(__file__).resolve().parents[1]
        combined = "\n".join(
            (root / name).read_text()
            for name in ("README.md", "AGENTS.md", "SECURITY.md")
        )
        forbidden_claim = "TOTAL_WALL_CLOCK_UPPER_BOUND_CLAIM=" + "true"
        self.assertNotIn(forbidden_claim, combined)


if __name__ == "__main__":
    unittest.main()
