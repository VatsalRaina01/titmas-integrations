import json
import os
import socket
import unittest

from titmas_integrations import (
    EndpointBinding,
    P0ResolverObservation,
    ResolverFailureCategory,
    validate_endpoint_continuity,
)
from titmas_integrations._p0_resolver_worker import build_worker_document
from titmas_integrations.p0_resolver import (
    _resolve_endpoint_with_worker,
)


HOST = "api.example.com"
ALLOWLIST = frozenset({HOST})


def tuple4(address: str = "192.31.196.1", port: int = 443):
    return (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, port))


def tuple6(address: str = "2001:3::1", port: int = 443):
    return (
        socket.AF_INET6,
        socket.SOCK_STREAM,
        socket.IPPROTO_TCP,
        "",
        (address, port, 0, 0),
    )


def resolving(results):
    def fake(hostname, port, family, socket_type, protocol, flags):
        if (
            hostname != HOST
            or port != 443
            or family != socket.AF_UNSPEC
            or socket_type != socket.SOCK_STREAM
            or protocol != socket.IPPROTO_TCP
            or flags != 0
        ):
            raise AssertionError("resolver input drift")
        return results

    return fake


def run_fake(results, *, deadline_ms: int = 500):
    return _resolve_endpoint_with_worker(
        HOST,
        ALLOWLIST,
        resolver=resolving(results),
        deadline_ms=deadline_ms,
    )


def raw_child(payload: bytes, exit_code: int = 0):
    def entry(write_fd, hostname, resolver):
        os.write(write_fd, payload)
        os.close(write_fd)
        if exit_code:
            os._exit(exit_code)

    return entry


class P0ResolverPositiveContractTests(unittest.TestCase):
    def test_p0_pos_001_single_ipv4_pass(self):
        result = run_fake([tuple4()])
        self.assertEqual(result.observation.status, "PASS")
        self.assertEqual(result.observation.selected_address_family, "AF_INET")
        self.assertIsInstance(result.endpoint_binding, EndpointBinding)

    def test_p0_pos_002_single_ipv6_pass(self):
        result = run_fake([tuple6()])
        self.assertEqual(result.observation.status, "PASS")
        self.assertEqual(result.observation.selected_address_family, "AF_INET6")

    def test_p0_pos_003_mixed_family_selects_first_unique(self):
        result = run_fake([tuple6(), tuple4()])
        self.assertEqual(result.endpoint_binding.selected_sockaddr, ("2001:3::1", 443, 0, 0))
        self.assertEqual(result.observation.raw_result_count, 2)
        self.assertEqual(result.observation.unique_usable_result_count, 2)

    def test_p0_pos_004_duplicates_are_deduplicated(self):
        result = run_fake([tuple4(), tuple4()])
        self.assertEqual(result.observation.raw_result_count, 2)
        self.assertEqual(result.observation.unique_usable_result_count, 1)

    def test_p0_pos_005_observation_is_sanitized(self):
        result = run_fake([tuple4()])
        serialized = json.dumps(result.observation.to_dict()).lower()
        for forbidden in (HOST, "192.31.196.1", "sockaddr", "exception", "credential"):
            self.assertNotIn(forbidden, serialized)

    def test_p0_pos_006_same_binding_continuity(self):
        binding = run_fake([tuple4()]).endpoint_binding
        validate_endpoint_continuity(
            binding,
            p1_binding=binding,
            p1_resolver_calls=0,
            p1_connect_calls=1,
            p1_alternate_attempts=0,
            p1_sockaddr=binding.selected_sockaddr,
            p2_server_hostname=HOST,
        )


class P0ResolverNegativeContractTests(unittest.TestCase):
    def test_p0_neg_001_hostname_not_allowlisted(self):
        with self.assertRaisesRegex(ValueError, "allowlist"):
            _resolve_endpoint_with_worker(
                HOST,
                frozenset({"other.example.com"}),
                resolver=resolving([tuple4()]),
                deadline_ms=100,
            )

    def test_p0_neg_002_ip_literal_rejected(self):
        with self.assertRaisesRegex(ValueError, "IP literal"):
            _resolve_endpoint_with_worker(
                "192.31.196.1",
                frozenset({"192.31.196.1"}),
                resolver=resolving([tuple4()]),
                deadline_ms=100,
            )

    def test_p0_neg_003_port_is_fixed_443(self):
        document = build_worker_document(HOST, resolving([tuple4(port=8443)]))
        self.assertEqual(document["status"], "FAIL")
        self.assertEqual(document["failure_category"], "DNS_NO_USABLE_TCP_ADDRESS")

    def test_p0_neg_004_resolver_second_call_is_never_needed(self):
        calls = 0

        def one_call_only(*args):
            nonlocal calls
            calls += 1
            if calls > 1:
                raise AssertionError("second resolver call")
            return [tuple4()]

        result = _resolve_endpoint_with_worker(
            HOST, ALLOWLIST, resolver=one_call_only, deadline_ms=500
        )
        self.assertEqual(result.observation.status, "PASS")

    def test_p0_neg_005_deadline_cannot_report_pass(self):
        import time

        def slow(*args):
            time.sleep(0.1)
            return [tuple4()]

        result = _resolve_endpoint_with_worker(
            HOST, ALLOWLIST, resolver=slow, deadline_ms=10
        )
        self.assertEqual(result.observation.status, "FAIL")
        self.assertIn(
            result.observation.failure_category,
            {
                ResolverFailureCategory.DNS_TIMEOUT,
                ResolverFailureCategory.DNS_WORKER_TERMINATION_UNCONFIRMED,
            },
        )

    def test_p0_neg_006_name_not_found_maps_to_failure(self):
        def missing(*args):
            raise socket.gaierror(socket.EAI_NONAME, "sensitive")

        result = _resolve_endpoint_with_worker(
            HOST, ALLOWLIST, resolver=missing, deadline_ms=500
        )
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_NAME_NOT_FOUND,
        )

    def test_p0_neg_007_temporary_failure_maps_to_failure(self):
        def temporary(*args):
            raise socket.gaierror(socket.EAI_AGAIN, "sensitive")

        result = _resolve_endpoint_with_worker(
            HOST, ALLOWLIST, resolver=temporary, deadline_ms=500
        )
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_TEMPORARY_FAILURE,
        )

    def test_p0_neg_008_empty_result_fails(self):
        result = run_fake([])
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_EMPTY_RESULT,
        )

    def test_p0_neg_009_raw_result_limit(self):
        result = run_fake([tuple4()] * 65)
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_RESULT_LIMIT_EXCEEDED,
        )

    def test_p0_neg_010_unique_result_limit_in_ipc(self):
        payload = json.dumps(
            {
                "family": socket.AF_INET,
                "failure_category": "NONE",
                "protocol": socket.IPPROTO_TCP,
                "raw_result_count": 64,
                "selected_sockaddr": ["192.31.196.1", 443],
                "socket_type": socket.SOCK_STREAM,
                "status": "PASS",
                "unique_usable_result_count": 65,
            },
            separators=(",", ":"),
        ).encode()
        result = _resolve_endpoint_with_worker(
            HOST,
            ALLOWLIST,
            resolver=resolving([]),
            deadline_ms=500,
            child_entry=raw_child(payload),
        )
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_IPC_BOUNDARY_VIOLATION,
        )

    def test_p0_neg_011_unsupported_family(self):
        result = run_fake([(9999, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("x", 443))])
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_NO_USABLE_TCP_ADDRESS,
        )

    def test_p0_neg_012_non_stream_result(self):
        result = run_fake([(socket.AF_INET, socket.SOCK_DGRAM, 17, "", ("192.31.196.1", 443))])
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_NO_USABLE_TCP_ADDRESS,
        )

    def test_p0_neg_013_non_tcp_protocol(self):
        result = run_fake([(socket.AF_INET, socket.SOCK_STREAM, 17, "", ("192.31.196.1", 443))])
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_NO_USABLE_TCP_ADDRESS,
        )

    def test_p0_neg_014_invalid_sockaddr_shape_or_port(self):
        for item in (
            (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("192.31.196.1",)),
            tuple4(port=8443),
        ):
            with self.subTest(item=item):
                self.assertEqual(
                    run_fake([item]).observation.failure_category,
                    ResolverFailureCategory.DNS_NO_USABLE_TCP_ADDRESS,
                )

    def test_p0_neg_015_selected_address_comes_from_worker_result(self):
        document = build_worker_document(HOST, resolving([tuple4("192.31.196.9")]))
        self.assertEqual(document["selected_sockaddr"], ["192.31.196.9", 443])

    def test_p0_neg_016_different_binding_rejected(self):
        first = run_fake([tuple4()]).endpoint_binding
        second = run_fake([tuple4()]).endpoint_binding
        with self.assertRaisesRegex(ValueError, "same EndpointBinding"):
            validate_endpoint_continuity(
                first,
                p1_binding=second,
                p1_resolver_calls=0,
                p1_connect_calls=1,
                p1_alternate_attempts=0,
                p1_sockaddr=first.selected_sockaddr,
                p2_server_hostname=HOST,
            )

    def test_p0_neg_017_p1_reresolution_rejected(self):
        binding = run_fake([tuple4()]).endpoint_binding
        with self.assertRaisesRegex(ValueError, "resolve again"):
            validate_endpoint_continuity(
                binding,
                p1_binding=binding,
                p1_resolver_calls=1,
                p1_connect_calls=1,
                p1_alternate_attempts=0,
                p1_sockaddr=binding.selected_sockaddr,
                p2_server_hostname=HOST,
            )

    def test_p0_neg_018_no_socket_create_connection_helper(self):
        source = (
            __import__("pathlib").Path(__file__).resolve().parents[1]
            / "src/titmas_integrations/p0_resolver.py"
        ).read_text()
        self.assertNotIn("socket.create_connection", source)

    def test_p0_neg_019_second_connect_rejected(self):
        binding = run_fake([tuple4()]).endpoint_binding
        with self.assertRaisesRegex(ValueError, "one connect"):
            validate_endpoint_continuity(
                binding,
                p1_binding=binding,
                p1_resolver_calls=0,
                p1_connect_calls=2,
                p1_alternate_attempts=0,
                p1_sockaddr=binding.selected_sockaddr,
                p2_server_hostname=HOST,
            )

    def test_p0_neg_020_fallback_rejected(self):
        binding = run_fake([tuple4()]).endpoint_binding
        with self.assertRaisesRegex(ValueError, "fallback"):
            validate_endpoint_continuity(
                binding,
                p1_binding=binding,
                p1_resolver_calls=0,
                p1_connect_calls=1,
                p1_alternate_attempts=1,
                p1_sockaddr=binding.selected_sockaddr,
                p2_server_hostname=HOST,
            )

    def test_p0_neg_021_ip_tls_identity_rejected(self):
        binding = run_fake([tuple4()]).endpoint_binding
        with self.assertRaisesRegex(ValueError, "original exact hostname"):
            validate_endpoint_continuity(
                binding,
                p1_binding=binding,
                p1_resolver_calls=0,
                p1_connect_calls=1,
                p1_alternate_attempts=0,
                p1_sockaddr=binding.selected_sockaddr,
                p2_server_hostname="192.31.196.1",
            )

    def test_p0_neg_022_observation_forbids_sensitive_values(self):
        serialized = json.dumps(run_fake([tuple4()]).observation.to_dict()).lower()
        for marker in ("hostname", "ip_address", "sockaddr", "exception", HOST):
            self.assertNotIn(marker, serialized)

    def test_p0_neg_023_synthetic_pass_without_execution_rejected(self):
        with self.assertRaisesRegex(ValueError, "PASS requires"):
            P0ResolverObservation(
                status="PASS",
                elapsed_ms=0,
                raw_result_count=1,
                unique_usable_result_count=1,
                selected_address_family="AF_INET",
                failure_category=ResolverFailureCategory.NONE,
                resolution_handle_ref="resolution-ref",
                resolver_worker_receipt_ref="worker-ref",
                executed=False,
            )

    def test_p0_neg_024_unknown_ipc_property_rejected(self):
        payload = json.dumps(
            {
                "failure_category": "DNS_EMPTY_RESULT",
                "raw_result_count": 0,
                "status": "FAIL",
                "unique_usable_result_count": 0,
                "extra": "forbidden",
            },
            separators=(",", ":"),
        ).encode()
        result = _resolve_endpoint_with_worker(
            HOST,
            ALLOWLIST,
            resolver=resolving([]),
            deadline_ms=500,
            child_entry=raw_child(payload),
        )
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_IPC_BOUNDARY_VIOLATION,
        )


if __name__ == "__main__":
    unittest.main()
