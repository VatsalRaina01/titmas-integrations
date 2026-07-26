import dataclasses
import json
from pathlib import Path
import unittest

import titmas_integrations
from titmas_integrations import (
    FailureCategory,
    PhaseEvent,
    PhaseId,
    PhaseStatus,
    PhaseTrace,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "src/titmas_integrations/instrumentation.py").read_text()


def p0_failure() -> PhaseTrace:
    events = [
        PhaseEvent(
            phase_id=PhaseId.P0,
            status=PhaseStatus.FAIL,
            started_at_monotonic_ref="mono-0",
            elapsed_ms=10,
            timeout_budget_ms=1000,
            bytes_in=0,
            bytes_out=0,
            failure_category=FailureCategory.DNS_TIMEOUT,
            predecessor_phase=None,
            executed=True,
        )
    ]
    for index, phase_id in enumerate(tuple(PhaseId)[1:], start=1):
        events.append(
            PhaseEvent(
                phase_id=phase_id,
                status=PhaseStatus.NOT_EXECUTED_PREREQUISITE_FAILED,
                started_at_monotonic_ref=f"mono-{index}",
                elapsed_ms=0,
                timeout_budget_ms=1000,
                bytes_in=0,
                bytes_out=0,
                failure_category=FailureCategory.NONE,
                predecessor_phase=tuple(PhaseId)[index - 1],
                executed=False,
            )
        )
    return PhaseTrace(tuple(events))


class NegativeBoundaryTests(unittest.TestCase):
    def test_rb1_neg_001_core_has_no_network_client(self) -> None:
        forbidden = ("import socket", "import urllib", "import requests", "import httpx")
        self.assertFalse(any(marker in SOURCE for marker in forbidden))

    def test_rb1_neg_002_contract_has_no_credential_fields(self) -> None:
        names = {field.name.lower() for field in dataclasses.fields(PhaseEvent)}
        self.assertTrue(
            names.isdisjoint({"credential", "api_key", "token", "authorization"})
        )

    def test_rb1_neg_003_core_has_no_provider_sdk(self) -> None:
        self.assertNotIn("providers", SOURCE)
        self.assertFalse(any(ROOT.glob("src/titmas_integrations/providers/*")))

    def test_rb1_neg_004_core_has_no_dbos_or_saee_runtime_import(self) -> None:
        lowered = SOURCE.lower()
        self.assertNotIn("import dbos", lowered)
        self.assertNotIn("import saee", lowered)

    def test_rb1_neg_005_serialization_does_not_claim_evidence_or_truth(self) -> None:
        serialized = p0_failure().to_dict()
        self.assertNotIn("evidence", serialized)
        self.assertNotIn("truth", serialized)

    def test_rb1_neg_006_schema_pass_is_not_conformance(self) -> None:
        entry = json.loads((ROOT / "TITMAS-INTEGRATIONS-ENTRY.v0.1.json").read_text())
        self.assertFalse(entry["current_state"]["provider_supported"])
        self.assertFalse(entry["current_state"]["conformance_executed"])

    def test_rb1_neg_007_first_failure_is_immutable(self) -> None:
        trace = p0_failure()
        with self.assertRaises(dataclasses.FrozenInstanceError):
            trace.events[0].failure_category = FailureCategory.NONE  # type: ignore[misc]

    def test_rb1_neg_008_sensitive_content_is_not_expressible(self) -> None:
        payload = json.dumps(p0_failure().to_dict()).lower()
        for marker in (
            "raw_request_body",
            "raw_response_body",
            "prompt",
            "review_content",
            "hidden_reasoning",
            "authorization",
        ):
            self.assertNotIn(marker, payload)

    def test_rb1_neg_009_repository_does_not_claim_provider_or_production(self) -> None:
        entry = json.loads((ROOT / "TITMAS-INTEGRATIONS-ENTRY.v0.1.json").read_text())
        self.assertEqual(entry["support_declaration"]["supported"], [])
        self.assertFalse(entry["current_state"]["provider_supported"])
        self.assertFalse(entry["current_state"]["release_authorized"])
        self.assertEqual(
            entry["current_state"]["commercial_availability"], "NOT_CLAIMED"
        )

    def test_rb1_neg_010_public_api_has_no_authority_or_permission(self) -> None:
        self.assertEqual(
            set(titmas_integrations.__all__),
            {
                "FailureCategory",
                "PhaseEvent",
                "PhaseId",
                "PhaseStatus",
                "PhaseTrace",
                "validate_phase_trace",
            },
        )
        self.assertTrue(
            all(
                marker not in name.lower()
                for name in titmas_integrations.__all__
                for marker in ("permission", "authorization", "execution")
            )
        )


if __name__ == "__main__":
    unittest.main()
