from dataclasses import FrozenInstanceError
import json
from pathlib import Path
import unittest

from titmas_integrations import (
    FailureCategory,
    PhaseEvent,
    PhaseId,
    PhaseStatus,
    PhaseTrace,
    validate_phase_trace,
)


PHASES = tuple(PhaseId)
FAILURES = (
    FailureCategory.DNS_TIMEOUT,
    FailureCategory.TCP_CONNECT_TIMEOUT,
    FailureCategory.TLS_HANDSHAKE_TIMEOUT,
    FailureCategory.HTTP_HEADERS_WRITE_TIMEOUT,
    FailureCategory.HTTP_BODY_WRITE_TIMEOUT,
    FailureCategory.HTTP_RESPONSE_HEADERS_TIMEOUT,
    FailureCategory.HTTP_RESPONSE_BODY_TIMEOUT,
    FailureCategory.CONTENT_EXTRACTION_FAILURE,
    FailureCategory.RESPONSE_SCHEMA_FAILURE,
    FailureCategory.SANITIZED_HANDOFF_FAILURE,
)


def event(index: int, status: PhaseStatus, failure: FailureCategory) -> PhaseEvent:
    return PhaseEvent(
        phase_id=PHASES[index],
        status=status,
        started_at_monotonic_ref=f"mono-{index}",
        elapsed_ms=index + 0.25 if status is not PhaseStatus.NOT_EXECUTED_PREREQUISITE_FAILED else 0,
        timeout_budget_ms=1000,
        bytes_in=index if status is not PhaseStatus.NOT_EXECUTED_PREREQUISITE_FAILED else 0,
        bytes_out=index * 2 if status is not PhaseStatus.NOT_EXECUTED_PREREQUISITE_FAILED else 0,
        failure_category=failure,
        predecessor_phase=None if index == 0 else PHASES[index - 1],
        executed=status is not PhaseStatus.NOT_EXECUTED_PREREQUISITE_FAILED,
    )


def success_trace() -> PhaseTrace:
    return PhaseTrace(
        tuple(event(i, PhaseStatus.PASS, FailureCategory.NONE) for i in range(10))
    )


def failed_trace(failure_index: int) -> PhaseTrace:
    events = []
    for index in range(10):
        if index < failure_index:
            events.append(event(index, PhaseStatus.PASS, FailureCategory.NONE))
        elif index == failure_index:
            events.append(event(index, PhaseStatus.FAIL, FAILURES[index]))
        else:
            events.append(
                event(
                    index,
                    PhaseStatus.NOT_EXECUTED_PREREQUISITE_FAILED,
                    FailureCategory.NONE,
                )
            )
    return PhaseTrace(tuple(events))


class InstrumentationContractTests(unittest.TestCase):
    def test_complete_success_trace(self) -> None:
        trace = success_trace()
        self.assertEqual(tuple(e.phase_id for e in trace.events), PHASES)
        self.assertTrue(all(e.status is PhaseStatus.PASS for e in trace.events))

    def test_each_phase_can_be_the_single_first_failure(self) -> None:
        for failure_index in range(10):
            with self.subTest(failure_index=failure_index):
                trace = failed_trace(failure_index)
                self.assertEqual(
                    sum(e.status is PhaseStatus.FAIL for e in trace.events), 1
                )
                self.assertTrue(
                    all(
                        e.status is PhaseStatus.NOT_EXECUTED_PREREQUISITE_FAILED
                        for e in trace.events[failure_index + 1 :]
                    )
                )

    def test_serialization_is_deterministic(self) -> None:
        trace = failed_trace(6)
        first = json.dumps(trace.to_dict(), sort_keys=True, separators=(",", ":"))
        second = json.dumps(trace.to_dict(), sort_keys=True, separators=(",", ":"))
        self.assertEqual(first, second)

    def test_schema_version_is_explicit(self) -> None:
        self.assertEqual(success_trace().to_dict()["schema_version"], "0.1.0")

    def test_trace_is_frozen(self) -> None:
        trace = success_trace()
        with self.assertRaises(FrozenInstanceError):
            trace.events = ()  # type: ignore[misc]
        with self.assertRaises(FrozenInstanceError):
            trace.events[0].status = PhaseStatus.FAIL  # type: ignore[misc]

    def test_validate_rejects_incomplete_or_duplicate_order(self) -> None:
        events = success_trace().events
        with self.assertRaisesRegex(ValueError, "exactly P0-P9"):
            validate_phase_trace(events[:-1])
        with self.assertRaisesRegex(ValueError, "complete, unique"):
            validate_phase_trace(events[:1] + events[:1] + events[2:])

    def test_validate_rejects_execution_after_failure(self) -> None:
        events = list(failed_trace(3).events)
        events[4] = event(4, PhaseStatus.PASS, FailureCategory.NONE)
        with self.assertRaisesRegex(ValueError, "close every dependent"):
            validate_phase_trace(events)

    def test_phase_event_rejects_wrong_predecessor(self) -> None:
        with self.assertRaisesRegex(ValueError, "predecessor"):
            PhaseEvent(
                phase_id=PhaseId.P2,
                status=PhaseStatus.PASS,
                started_at_monotonic_ref="mono-2",
                elapsed_ms=1,
                timeout_budget_ms=100,
                bytes_in=0,
                bytes_out=0,
                failure_category=FailureCategory.NONE,
                predecessor_phase=PhaseId.P0,
                executed=True,
            )

    def test_phase_event_rejects_negative_counts(self) -> None:
        with self.assertRaisesRegex(ValueError, "bytes_in"):
            PhaseEvent(
                phase_id=PhaseId.P0,
                status=PhaseStatus.PASS,
                started_at_monotonic_ref="mono-0",
                elapsed_ms=0,
                timeout_budget_ms=100,
                bytes_in=-1,
                bytes_out=0,
                failure_category=FailureCategory.NONE,
                predecessor_phase=None,
                executed=True,
            )

    def test_serialized_shape_matches_phase_schema(self) -> None:
        try:
            from jsonschema import Draft202012Validator
        except ImportError:
            self.skipTest("jsonschema is unavailable")
        root = Path(__file__).resolve().parents[1]
        schema = json.loads(
            (root / "schemas/phase-trace.schema.v0.1.json").read_text()
        )
        for trace in (success_trace(), failed_trace(0), failed_trace(9)):
            errors = list(Draft202012Validator(schema).iter_errors(trace.to_dict()))
            self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
