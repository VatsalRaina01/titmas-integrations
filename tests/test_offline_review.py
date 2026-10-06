# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 zhangbin
"""只检查离线样例的真实 SDK 映射和边界，不评价模型能力。"""
from __future__ import annotations

import importlib.util
import json
import socket
from pathlib import Path
from unittest.mock import patch

import pytest
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("offline_review", ROOT / "examples/offline-review/run.py")
assert SPEC is not None and SPEC.loader is not None
demo = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(demo)


def test_three_results_are_preserved_and_called_once() -> None:
    report = demo.build_report()
    assert [c["outcome"]["result"] for c in report["cases"]] == ["FAIL", "PASS", "NOT_ASSESSED"]
    assert all(c["sdk_call_count"] == 1 for c in report["cases"])
    assert "尚未评估" in report["cases"][2]["display_zh"]


def test_no_network_or_real_api_client_is_constructed(monkeypatch: pytest.MonkeyPatch) -> None:
    def forbidden(*args: object, **kwargs: object) -> None:
        pytest.fail("离线样例不得创建网络连接或真实 API 客户端")
    monkeypatch.setattr(socket, "socket", forbidden)
    monkeypatch.setattr(socket, "getaddrinfo", forbidden)
    with patch("titmas_agent_sdk.client.ApiClient", side_effect=forbidden):
        assert len(demo.build_report()["cases"]) == 3


def test_no_authority_or_real_verification_claims() -> None:
    report = demo.build_report()
    for name in ("business_correctness_assessed", "live_service_used",
                 "receipt_signature_verified", "permission_granted"):
        assert report[name] is False
    for case in report["cases"]:
        for name in ("formal_conformance", "certification", "truth_claim", "authorization_effect"):
            assert case["outcome"][name] is False


def test_deterministic_output() -> None:
    assert demo.build_report() == demo.build_report()


def test_fixture_does_not_depend_on_working_directory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    folder = tmp_path / "中文 空格路径"
    folder.mkdir()
    monkeypatch.chdir(folder)
    assert len(demo.build_report()["cases"]) == 3


@pytest.mark.parametrize("replacement", ["UNKNOWN", "APPROVED", True, 1, None])
def test_unknown_result_is_rejected(tmp_path: Path, replacement: object) -> None:
    data = json.loads(demo.FIXTURE.read_text(encoding="utf-8"))
    data["cases"][0]["response"]["result"] = replacement
    path = tmp_path / "invalid.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(ValidationError):
        demo.build_report(path)


def test_missing_reason_is_rejected(tmp_path: Path) -> None:
    data = json.loads(demo.FIXTURE.read_text(encoding="utf-8"))
    data["cases"][0]["response"]["reason_codes"] = []
    path = tmp_path / "missing.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(ValidationError):
        demo.build_report(path)


def test_non_synthetic_input_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "real.json"
    path.write_text(json.dumps({"kind": "REAL_CUSTOMER_DATA"}), encoding="utf-8")
    with pytest.raises(ValueError, match="合成"):
        demo.build_report(path)


def test_no_environment_credentials_read(monkeypatch: pytest.MonkeyPatch) -> None:
    sentinel = "SYNTHETIC_ENV_SENTINEL_NOT_A_SECRET"
    monkeypatch.setenv("TITMAS_API_KEY", sentinel)
    assert sentinel not in json.dumps(demo.build_report())


def test_human_and_machine_output(capsys: pytest.CaptureFixture[str]) -> None:
    with patch("sys.argv", ["run.py"]):
        demo.main()
    human = capsys.readouterr().out
    for case in demo.build_report()["cases"]:
        assert case["display_zh"] in human
    with patch("sys.argv", ["run.py", "--json"]):
        demo.main()
    machine = json.loads(capsys.readouterr().out)
    assert machine["kind"] == "SYNTHETIC_SDK_RESPONSE_HANDLING_DEMO"


def test_machine_entry_and_task_links_resolve() -> None:
    entry = json.loads((ROOT / "agent-entry.json").read_text(encoding="utf-8"))
    prep = entry["bounded_contribution_preparation"]
    for key in ("readiness", "tasks", "guide", "license_scope", "example"):
        assert (ROOT / prep[key]).is_file()
    tasks = json.loads((ROOT / prep["tasks"]).read_text(encoding="utf-8"))
    assert len(tasks["tasks"]) == 3
    assert tasks["status"] == "DRAFT_NOT_PUBLISHED"
    for task in tasks["tasks"]:
        assert (ROOT / "docs/contribution-intake" / task["file"]).is_file()


def test_license_is_exact_new_files_not_blanket_sdk_license() -> None:
    scope = json.loads((ROOT / "LICENSE-SCOPE.json").read_text(encoding="utf-8"))
    assert scope["license"] == "Apache-2.0"
    assert scope["scope_kind"] == "EXACT_NEW_FILES_ONLY"
    assert scope["existing_file_licenses_changed"] is False
    assert scope["private_core_included"] is False
    assert len(scope["files"]) == len(set(scope["files"]))
    assert (ROOT / scope["license_text"]).is_file()
    for file in scope["files"]:
        assert "*" not in file and ".." not in Path(file).parts
        assert (ROOT / file).is_file()
        assert not file.startswith(("titmas-python-sdk/", "titmas-typescript-sdk/", "openapi/"))


def test_candidate_is_not_claimed_active_or_real_adoption() -> None:
    ready = json.loads(
        (ROOT / "docs/contribution-intake/readiness.json").read_text(encoding="utf-8")
    )
    for field in ("public_entry_active", "issues_published", "private_core_exported",
                  "production_access_granted", "sdk_changed", "canonical_contract_changed"):
        assert ready[field] is False
