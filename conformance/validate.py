"""Independent-path validator for serialized TITMAS phase traces.

This module intentionally does not import the target implementation. It uses
only the Python standard library, performs no network access, and writes no
files. A passing result is a local Development contract rehearsal, not
Evidence, Truth, Provider conformance, certification, or release authority.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
from typing import Final


SCHEMA_VERSION: Final = "0.1.0"
PHASES: Final = tuple(f"P{index}" for index in range(10))
STATUSES: Final = {
    "PASS",
    "FAIL",
    "NOT_EXECUTED_PREREQUISITE_FAILED",
}
FAILURE_CATEGORIES: Final = {
    "NONE",
    "DNS_TIMEOUT",
    "TCP_CONNECT_TIMEOUT",
    "TLS_HANDSHAKE_TIMEOUT",
    "HTTP_HEADERS_WRITE_TIMEOUT",
    "HTTP_BODY_WRITE_TIMEOUT",
    "HTTP_RESPONSE_HEADERS_TIMEOUT",
    "HTTP_RESPONSE_BODY_TIMEOUT",
    "HTTP_RESPONSE_TRUNCATED",
    "CONTENT_EXTRACTION_FAILURE",
    "RESPONSE_SCHEMA_FAILURE",
    "SANITIZED_HANDOFF_FAILURE",
    "BOUNDARY_VIOLATION",
}
TOP_LEVEL_FIELDS: Final = {"schema_version", "events"}
EVENT_FIELDS: Final = {
    "phase_id",
    "status",
    "started_at_monotonic_ref",
    "elapsed_ms",
    "timeout_budget_ms",
    "bytes_in",
    "bytes_out",
    "failure_category",
    "predecessor_phase",
    "executed",
    "observed_http_status",
    "observed_returned_model_identifier",
    "raw_envelope_sha256",
    "sanitized_result_sha256",
}
MANIFEST_FIELDS: Final = {"$schema", "schema_version", "profile_version", "cases"}
CASE_FIELDS: Final = {"case_id", "path", "sha256", "expected"}
SAFE_REFERENCE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
CASE_ID = re.compile(r"^CONF-(PASS|FAIL)-[0-9]{3}$")


def _is_number(value: object) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float))


def _is_integer(value: object) -> bool:
    return not isinstance(value, bool) and isinstance(value, int)


def _check_exact_fields(
    value: object, expected: set[str], location: str, errors: list[str]
) -> dict[str, object] | None:
    if not isinstance(value, dict):
        errors.append(f"{location}: expected object")
        return None
    actual = set(value)
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    if missing:
        errors.append(f"{location}: missing fields {','.join(missing)}")
    if extra:
        errors.append(f"{location}: additional fields {','.join(extra)}")
    return value


def _check_event(event: object, index: int, errors: list[str]) -> None:
    location = f"events[{index}]"
    value = _check_exact_fields(event, EVENT_FIELDS, location, errors)
    if value is None:
        return

    phase_id = value.get("phase_id")
    expected_phase = PHASES[index]
    if phase_id != expected_phase:
        errors.append(f"{location}.phase_id: expected {expected_phase}")

    predecessor = value.get("predecessor_phase")
    expected_predecessor = None if index == 0 else PHASES[index - 1]
    if predecessor != expected_predecessor:
        errors.append(
            f"{location}.predecessor_phase: expected {expected_predecessor}"
        )

    status = value.get("status")
    if status not in STATUSES:
        errors.append(f"{location}.status: unknown status")

    failure_category = value.get("failure_category")
    if failure_category not in FAILURE_CATEGORIES:
        errors.append(f"{location}.failure_category: unknown category")

    reference = value.get("started_at_monotonic_ref")
    if not isinstance(reference, str) or not SAFE_REFERENCE.fullmatch(reference):
        errors.append(f"{location}.started_at_monotonic_ref: unsafe reference")

    for field in ("elapsed_ms", "timeout_budget_ms"):
        field_value = value.get(field)
        if not _is_number(field_value) or field_value < 0:
            errors.append(f"{location}.{field}: expected non-negative number")

    for field in ("bytes_in", "bytes_out"):
        field_value = value.get(field)
        if not _is_integer(field_value) or field_value < 0:
            errors.append(f"{location}.{field}: expected non-negative integer")

    executed = value.get("executed")
    if not isinstance(executed, bool):
        errors.append(f"{location}.executed: expected boolean")
    elif status == "PASS":
        if not executed or failure_category != "NONE":
            errors.append(f"{location}: PASS execution invariant failed")
    elif status == "FAIL":
        if not executed or failure_category == "NONE":
            errors.append(f"{location}: FAIL execution invariant failed")
    elif status == "NOT_EXECUTED_PREREQUISITE_FAILED":
        if executed or failure_category != "NONE":
            errors.append(f"{location}: NOT_EXECUTED invariant failed")

    http_status = value.get("observed_http_status")
    if http_status is not None and (
        not _is_integer(http_status) or not 100 <= http_status <= 599
    ):
        errors.append(f"{location}.observed_http_status: invalid status")

    returned_model = value.get("observed_returned_model_identifier")
    if returned_model is not None and (
        not isinstance(returned_model, str)
        or not SAFE_REFERENCE.fullmatch(returned_model)
    ):
        errors.append(
            f"{location}.observed_returned_model_identifier: unsafe reference"
        )

    for field in ("raw_envelope_sha256", "sanitized_result_sha256"):
        digest = value.get(field)
        if digest is not None and (
            not isinstance(digest, str) or not SHA256.fullmatch(digest)
        ):
            errors.append(f"{location}.{field}: invalid SHA-256")


def validate_trace_document(document: object) -> list[str]:
    """Return deterministic validation errors for one serialized trace."""

    errors: list[str] = []
    value = _check_exact_fields(document, TOP_LEVEL_FIELDS, "$", errors)
    if value is None:
        return errors
    if value.get("schema_version") != SCHEMA_VERSION:
        errors.append("$.schema_version: expected 0.1.0")

    events = value.get("events")
    if not isinstance(events, list):
        errors.append("$.events: expected array")
        return errors
    if len(events) != len(PHASES):
        errors.append("$.events: expected exactly P0-P9")
        return errors

    for index, event in enumerate(events):
        _check_event(event, index, errors)

    statuses = [
        event.get("status") if isinstance(event, dict) else None for event in events
    ]
    failure_indices = [
        index for index, status in enumerate(statuses) if status == "FAIL"
    ]
    if len(failure_indices) > 1:
        errors.append("$.events: multiple first failures")
    elif not failure_indices:
        if any(status != "PASS" for status in statuses):
            errors.append("$.events: no-failure trace must contain only PASS")
    else:
        failure_index = failure_indices[0]
        for index, status in enumerate(statuses):
            expected = (
                "PASS"
                if index < failure_index
                else (
                    "FAIL"
                    if index == failure_index
                    else "NOT_EXECUTED_PREREQUISITE_FAILED"
                )
            )
            if status != expected:
                errors.append(
                    f"$.events[{index}].status: first failure requires {expected}"
                )
    return sorted(set(errors))


def _load_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_manifest(manifest_path: Path) -> dict[str, object]:
    """Execute a version-bound fixture manifest without changing its inputs."""

    manifest_path = manifest_path.resolve()
    root = manifest_path.parent
    errors: list[str] = []
    manifest = _check_exact_fields(
        _load_json(manifest_path), MANIFEST_FIELDS, "manifest", errors
    )
    if manifest is None:
        return {"status": "FAIL", "cases": [], "errors": sorted(errors)}
    if manifest.get("$schema") != "./case-manifest.schema.v0.1.json":
        errors.append("manifest.$schema: unexpected reference")
    if manifest.get("schema_version") != "0.1.0":
        errors.append("manifest.schema_version: expected 0.1.0")
    if manifest.get("profile_version") != "0.1.0":
        errors.append("manifest.profile_version: expected 0.1.0")
    cases = manifest.get("cases")
    if not isinstance(cases, list) or not cases:
        errors.append("manifest.cases: expected non-empty array")
        cases = []

    seen_ids: set[str] = set()
    seen_paths: set[str] = set()
    results: list[dict[str, object]] = []
    for index, case in enumerate(cases):
        location = f"manifest.cases[{index}]"
        item = _check_exact_fields(case, CASE_FIELDS, location, errors)
        if item is None:
            continue
        case_id = item.get("case_id")
        relative_path = item.get("path")
        expected = item.get("expected")
        digest = item.get("sha256")
        if not isinstance(case_id, str) or not CASE_ID.fullmatch(case_id):
            errors.append(f"{location}.case_id: invalid")
        elif case_id in seen_ids:
            errors.append(f"{location}.case_id: duplicate")
        else:
            seen_ids.add(case_id)
        if not isinstance(relative_path, str) or not relative_path:
            errors.append(f"{location}.path: invalid")
            continue
        if relative_path in seen_paths:
            errors.append(f"{location}.path: duplicate")
        seen_paths.add(relative_path)
        fixture_path = (root / relative_path).resolve()
        if not fixture_path.is_relative_to(root):
            errors.append(f"{location}.path: escapes manifest directory")
            continue
        if not fixture_path.is_file():
            errors.append(f"{location}.path: file not found")
            continue
        if not isinstance(digest, str) or not SHA256.fullmatch(digest):
            errors.append(f"{location}.sha256: invalid")
            continue
        actual_digest = _sha256(fixture_path)
        if actual_digest != digest:
            errors.append(f"{location}.sha256: digest mismatch")
            continue
        if expected not in {"PASS", "FAIL"}:
            errors.append(f"{location}.expected: unknown result")
            continue
        trace_errors = validate_trace_document(_load_json(fixture_path))
        observed = "PASS" if not trace_errors else "FAIL"
        matched = observed == expected
        if not matched:
            errors.append(f"{location}: expected {expected}, observed {observed}")
        results.append(
            {
                "case_id": case_id,
                "expected": expected,
                "observed": observed,
                "matched": matched,
                "error_count": len(trace_errors),
            }
        )

    status = "PASS" if not errors and len(results) == len(cases) else "FAIL"
    return {
        "status": status,
        "profile_version": manifest.get("profile_version"),
        "case_count": len(results),
        "matched_count": sum(bool(item["matched"]) for item in results),
        "cases": results,
        "errors": sorted(errors),
        "effects": {
            "evidence_created": False,
            "truth_created": False,
            "provider_conformance": False,
            "permission_granted": False,
            "release_authorized": False,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the local TITMAS phase-trace contract rehearsal."
    )
    parser.add_argument("--manifest", required=True, type=Path)
    args = parser.parse_args()
    try:
        result = run_manifest(args.manifest)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        result = {
            "status": "FAIL",
            "cases": [],
            "errors": [f"{type(exc).__name__}: {exc}"],
        }
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
