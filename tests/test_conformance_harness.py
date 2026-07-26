import copy
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from titmas_integrations import (
    FailureCategory,
    PhaseEvent,
    PhaseId,
    PhaseStatus,
    PhaseTrace,
)


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR_PATH = ROOT / "conformance/validate.py"
MANIFEST_PATH = ROOT / "conformance/case-manifest.v0.1.json"
FIXTURE_ROOT = ROOT / "conformance/fixtures"
spec = importlib.util.spec_from_file_location("phase_trace_conformance", VALIDATOR_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("cannot load independent-path conformance validator")
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


def load_fixture(name: str) -> object:
    return json.loads((FIXTURE_ROOT / name).read_text())


def implementation_success_trace() -> PhaseTrace:
    phases = tuple(PhaseId)
    return PhaseTrace(
        tuple(
            PhaseEvent(
                phase_id=phase,
                status=PhaseStatus.PASS,
                started_at_monotonic_ref=f"generated-{index}",
                elapsed_ms=1,
                timeout_budget_ms=1000,
                bytes_in=index,
                bytes_out=index,
                failure_category=FailureCategory.NONE,
                predecessor_phase=None if index == 0 else phases[index - 1],
                executed=True,
            )
            for index, phase in enumerate(phases)
        )
    )


class ConformanceHarnessTests(unittest.TestCase):
    def test_manifest_rehearsal_matches_all_frozen_expectations(self) -> None:
        result = validator.run_manifest(MANIFEST_PATH)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["case_count"], 7)
        self.assertEqual(result["matched_count"], 7)

    def test_three_positive_fixtures_pass(self) -> None:
        for name in (
            "pass-success.v0.1.json",
            "pass-failure-p0.v0.1.json",
            "pass-failure-p9.v0.1.json",
        ):
            with self.subTest(name=name):
                self.assertEqual(validator.validate_trace_document(load_fixture(name)), [])

    def test_four_negative_fixtures_fail(self) -> None:
        for name in (
            "fail-multiple-fail.v0.1.json",
            "fail-post-failure-execution.v0.1.json",
            "fail-sensitive-additional-field.v0.1.json",
            "fail-phase-order.v0.1.json",
        ):
            with self.subTest(name=name):
                self.assertTrue(validator.validate_trace_document(load_fixture(name)))

    def test_target_implementation_serialization_is_accepted(self) -> None:
        errors = validator.validate_trace_document(
            implementation_success_trace().to_dict()
        )
        self.assertEqual(errors, [])

    def test_validator_path_does_not_import_target_implementation(self) -> None:
        source = VALIDATOR_PATH.read_text()
        self.assertNotIn("import titmas_integrations", source)
        self.assertNotIn("from titmas_integrations", source)

    def test_validator_has_no_network_or_provider_import(self) -> None:
        source = VALIDATOR_PATH.read_text()
        for marker in (
            "import socket",
            "import urllib",
            "import requests",
            "import httpx",
            "import dbos",
            "import saee",
            "providers",
        ):
            self.assertNotIn(marker, source.lower())

    def test_additional_sensitive_field_is_rejected(self) -> None:
        document = copy.deepcopy(load_fixture("pass-success.v0.1.json"))
        document["events"][0]["hidden_reasoning"] = "forbidden"
        errors = validator.validate_trace_document(document)
        self.assertTrue(any("additional fields" in error for error in errors))

    def test_manifest_digest_drift_fails_closed(self) -> None:
        manifest = json.loads(MANIFEST_PATH.read_text())
        manifest["cases"][0]["sha256"] = "0" * 64
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            shutil.copytree(FIXTURE_ROOT, root / "fixtures")
            path = root / "manifest.json"
            path.write_text(json.dumps(manifest))
            result = validator.run_manifest(path)
        self.assertEqual(result["status"], "FAIL")
        self.assertTrue(any("digest mismatch" in error for error in result["errors"]))

    def test_result_is_deterministic(self) -> None:
        first = json.dumps(
            validator.run_manifest(MANIFEST_PATH),
            sort_keys=True,
            separators=(",", ":"),
        )
        second = json.dumps(
            validator.run_manifest(MANIFEST_PATH),
            sort_keys=True,
            separators=(",", ":"),
        )
        self.assertEqual(first, second)

    def test_cli_passes_without_writing_repository_files(self) -> None:
        before = {
            path.relative_to(ROOT): path.read_bytes()
            for path in (MANIFEST_PATH, *sorted(FIXTURE_ROOT.glob("*.json")))
        }
        completed = subprocess.run(
            [
                sys.executable,
                str(VALIDATOR_PATH),
                "--manifest",
                str(MANIFEST_PATH),
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        after = {
            path.relative_to(ROOT): path.read_bytes()
            for path in (MANIFEST_PATH, *sorted(FIXTURE_ROOT.glob("*.json")))
        }
        self.assertEqual(completed.returncode, 0)
        self.assertEqual(json.loads(completed.stdout)["status"], "PASS")
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
