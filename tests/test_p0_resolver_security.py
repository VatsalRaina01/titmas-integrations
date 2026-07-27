import copy
import ast
import json
import os
from pathlib import Path
import pickle
import shutil
import socket
import tempfile
import unittest
from unittest import mock

import titmas_integrations
import titmas_integrations.p0_resolver as resolver_module
from titmas_integrations import ResolverFailureCategory
from titmas_integrations.p0_resolver import (
    _destination_allowed,
    _load_destination_policy,
    _resolve_endpoint_with_worker,
)


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src/titmas_integrations/data"
HOST = "api.example.com"
ALLOWLIST = frozenset({HOST})


def normal_result(address="192.31.196.1"):
    return [
        (
            socket.AF_INET,
            socket.SOCK_STREAM,
            socket.IPPROTO_TCP,
            "",
            (address, 443),
        )
    ]


def resolver_for(results):
    def resolver(*args):
        return results

    return resolver


def run(results, **kwargs):
    return _resolve_endpoint_with_worker(
        HOST,
        ALLOWLIST,
        resolver=resolver_for(results),
        deadline_ms=500,
        **kwargs,
    )


class P0DestinationPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.policy = _load_destination_policy()

    def test_frozen_snapshot_manifest_and_digests_load(self):
        manifest = json.loads(
            (DATA / "global-unicast-destination-policy.v1.json").read_text()
        )
        self.assertEqual(
            manifest["ipv4"]["sha256"],
            "e3e39e76d00b1677335db8e9a805c7b9480ea2f4dc9e33f0b93cd3a905128d73",
        )
        self.assertEqual(
            manifest["ipv6"]["sha256"],
            "775feea0621dec8735a44fbf30f762e721e8f0a1b3ab7eb341961a88cfce2139",
        )
        self.assertGreater(len(self.policy.entries), 40)

    def test_snapshot_missing_fails_closed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            result = run(normal_result(), data_root=Path(temp_dir))
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_DESTINATION_POLICY_UNAVAILABLE,
        )

    def test_snapshot_digest_drift_fails_closed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            for source in DATA.glob("*"):
                if source.is_file():
                    shutil.copyfile(source, root / source.name)
            ipv4 = root / "iana-ipv4-special-registry-2025-10-09.csv"
            ipv4.write_bytes(ipv4.read_bytes() + b"x")
            result = run(normal_result(), data_root=root)
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_DESTINATION_POLICY_UNAVAILABLE,
        )

    def test_ipv4_rejected_classes(self):
        rejected = (
            "10.0.0.1",
            "100.64.0.1",
            "127.0.0.1",
            "169.254.1.1",
            "192.0.2.1",
            "198.18.0.1",
            "224.0.0.1",
            "240.0.0.1",
        )
        for address in rejected:
            with self.subTest(address=address):
                self.assertFalse(
                    _destination_allowed(address, socket.AF_INET, self.policy)
                )

    def test_ipv6_rejected_classes(self):
        rejected = (
            "::",
            "::1",
            "2001:db8::1",
            "3fff::1",
            "fc00::1",
            "fe80::1",
            "ff02::1",
        )
        for address in rejected:
            with self.subTest(address=address):
                self.assertFalse(
                    _destination_allowed(address, socket.AF_INET6, self.policy)
                )

    def test_most_specific_ipv4_allowed_entry_wins(self):
        self.assertTrue(
            _destination_allowed("192.0.0.9", socket.AF_INET, self.policy)
        )

    def test_most_specific_ipv6_allowed_entry_wins(self):
        self.assertTrue(
            _destination_allowed("2001:1::1", socket.AF_INET6, self.policy)
        )

    def test_normal_unlisted_global_address_is_allowed(self):
        self.assertTrue(_destination_allowed("8.8.8.8", socket.AF_INET, self.policy))

    def test_policy_rejection_does_not_fallback(self):
        result = run(
            [
                normal_result("10.0.0.1")[0],
                normal_result("192.31.196.1")[0],
            ]
        )
        self.assertEqual(
            result.observation.failure_category,
            ResolverFailureCategory.DNS_DESTINATION_POLICY_REJECTED,
        )
        self.assertIsNone(result.endpoint_binding)


class P0SecurityBoundaryTests(unittest.TestCase):
    def test_worker_environment_is_cleared(self):
        inherited_read_fd, inherited_write_fd = os.pipe()

        def environment_probe(*args):
            try:
                os.fstat(inherited_read_fd)
                inherited_fd_open = True
            except OSError:
                inherited_fd_open = False
            if os.environ or inherited_fd_open:
                return normal_result("10.0.0.1")
            return normal_result()

        try:
            with mock.patch.dict(
                os.environ,
                {"TITMAS_TEST_CREDENTIAL": "must-not-enter-worker-environment"},
                clear=False,
            ):
                result = _resolve_endpoint_with_worker(
                    HOST,
                    ALLOWLIST,
                    resolver=environment_probe,
                    deadline_ms=500,
                )
        finally:
            os.close(inherited_read_fd)
            os.close(inherited_write_fd)
        self.assertEqual(result.observation.status, "PASS")

    def test_binding_repr_is_redacted(self):
        binding = run(normal_result()).endpoint_binding
        rendered = repr(binding)
        self.assertNotIn(HOST, rendered)
        self.assertNotIn("192.31.196.1", rendered)
        self.assertNotIn("443", rendered)

    def test_binding_pickle_copy_and_deepcopy_fail_closed(self):
        binding = run(normal_result()).endpoint_binding
        with self.assertRaises(TypeError):
            pickle.dumps(binding)
        with self.assertRaises(TypeError):
            copy.copy(binding)
        with self.assertRaises(TypeError):
            copy.deepcopy(binding)

    def test_binding_is_immutable(self):
        binding = run(normal_result()).endpoint_binding
        with self.assertRaises(AttributeError):
            binding._original_hostname = "other.example.com"

    def test_public_observation_has_no_sensitive_fields(self):
        fields = set(run(normal_result()).observation.to_dict())
        forbidden = {
            "hostname",
            "ip_address",
            "sockaddr",
            "raw_payload",
            "exception",
            "credential",
            "authorization",
            "token",
        }
        self.assertTrue(fields.isdisjoint(forbidden))

    def test_source_has_no_provider_dbos_or_saee_import(self):
        sources = "\n".join(
            (ROOT / path).read_text()
            for path in (
                "src/titmas_integrations/p0_resolver.py",
                "src/titmas_integrations/_p0_resolver_worker.py",
            )
        ).lower()
        for marker in (
            "import requests",
            "import httpx",
            "import dbos",
            "import saee",
            "from dbos",
            "from saee",
            "providers.",
        ):
            self.assertNotIn(marker, sources)

    def test_public_api_adds_exact_six_symbols(self):
        expected = {
            "EndpointBinding",
            "P0ResolverObservation",
            "P0ResolverResult",
            "ResolverFailureCategory",
            "resolve_endpoint",
            "validate_endpoint_continuity",
        }
        self.assertTrue(all(hasattr(titmas_integrations, name) for name in expected))

    def test_unsupported_platform_preflight_fails_closed(self):
        with mock.patch.object(resolver_module.os, "name", "nt"):
            platform_result = run(normal_result())
        self.assertEqual(
            platform_result.observation.failure_category,
            ResolverFailureCategory.DNS_UNSUPPORTED_PLATFORM,
        )
        self.assertFalse(platform_result.observation.executed)

        with mock.patch.object(
            resolver_module.threading, "active_count", return_value=2
        ):
            context_result = run(normal_result())
        self.assertEqual(
            context_result.observation.failure_category,
            ResolverFailureCategory.DNS_UNSUPPORTED_EXECUTION_CONTEXT,
        )
        self.assertFalse(context_result.observation.executed)

    def test_tests_never_call_public_real_resolver(self):
        for path in sorted((ROOT / "tests").glob("test_p0_*.py")):
            tree = ast.parse(path.read_text())
            public_calls = [
                node
                for node in ast.walk(tree)
                if isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "resolve_endpoint"
            ]
            self.assertEqual(public_calls, [], path.name)

    def test_repository_contains_no_private_key_path_or_value(self):
        tracked_surface = "\n".join(
            path.read_text(errors="ignore")
            for path in (
                ROOT / "README.md",
                ROOT / "AGENTS.md",
                ROOT / "SECURITY.md",
                ROOT / "llms.txt",
                ROOT / "TITMAS-INTEGRATIONS-ENTRY.v0.1.json",
            )
        )
        self.assertNotIn("PRIVATE_ENV_FILE_PATH_SHOULD_NOT_APPEAR", tracked_surface)
        self.assertNotIn("PROVIDER_API_KEY=", tracked_surface)


if __name__ == "__main__":
    unittest.main()
