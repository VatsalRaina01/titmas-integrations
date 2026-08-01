from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK = json.loads((ROOT / "sdk-generation.lock.json").read_text())


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    source = ROOT / LOCK["source"]["path"]
    assert sha256(source) == LOCK["source"]["sha256"]

    contract = json.loads(source.read_text())
    assert contract["openapi"] == "3.1.0"
    assert contract["info"]["x-contract-version"] == "titmas-api-v1.0"
    assert set(contract["components"]["schemas"]["Result"]["enum"]) == {
        "PASS",
        "FAIL",
        "NOT_ASSESSED",
    }

    negative_fixtures = json.loads(
        (ROOT / "openapi/negative-fixtures-v1.json").read_text()
    )
    fixture_ids = {fixture["id"] for fixture in negative_fixtures["fixtures"]}
    assert fixture_ids == set(contract["x-negative-fixtures"])
    assert negative_fixtures["failure_closed"] is True
    assert negative_fixtures["authority_elevation"] is False
    assert negative_fixtures["database_effect"] is False
    assert negative_fixtures["receipt_storage_effect"] is False
    assert negative_fixtures["quota_logic_effect"] is False

    for language in ("python", "typescript"):
        generated = ROOT / LOCK["outputs"][language]["path"]
        metadata = json.loads((generated / "GENERATION_METADATA.json").read_text())
        assert metadata == {
            "GENERATED": True,
            "SOURCE": "openapi/titmas-api-v1.yaml",
            "SOURCE_SHA256": LOCK["source"]["sha256"],
            "GENERATOR": "OpenAPI Generator",
            "GENERATOR_VERSION": LOCK["generator"]["version"],
            "POSTPROCESS_PATCHES": [
                "OPENAPI_GENERATOR_7_24_0_PYTHON_CONST_FALSE",
                "NORMALIZE_GENERATED_TEXT_WHITESPACE",
            ],
        }
        assert (generated / ".openapi-generator" / "VERSION").read_text().strip() == LOCK[
            "generator"
        ]["version"]

    python_api = (
        ROOT / "titmas-python-sdk/generated/titmas_api_client/api/default_api.py"
    ).read_text()
    typescript_api = (
        ROOT / "titmas-typescript-sdk/generated/src/apis/DefaultApi.ts"
    ).read_text()
    for operation in ("preflight", "verify_receipt", "get_receipt", "get_quota"):
        assert f"titmas_{operation}" in python_api
    for operation in ("titmasPreflight", "titmasVerifyReceipt", "titmasGetReceipt", "titmasGetQuota"):
        assert operation in typescript_api

    python_boundaries = (
        ROOT
        / "titmas-python-sdk/generated/titmas_api_client/models/authority_boundaries.py"
    ).read_text()
    assert python_boundaries.count("if value is not False:") == 6
    assert "set(['false'])" not in python_boundaries

    for language in ("python", "typescript"):
        generated = ROOT / LOCK["outputs"][language]["path"]
        for path in generated.rglob("*"):
            if path.is_file() and path.suffix in {".md", ".py", ".ts"}:
                text = path.read_text()
                assert text.endswith("\n")
                assert not text.endswith("\n\n")
                assert all(line == line.rstrip() for line in text.splitlines())

    forbidden_python = ("import requests", "import urllib3", "httpx.Client(")
    python_semantic = "\n".join(
        path.read_text() for path in (ROOT / "titmas-python-sdk/src").rglob("*.py")
    )
    assert not any(token in python_semantic for token in forbidden_python)

    forbidden_typescript = ("fetch(", "axios", "XMLHttpRequest")
    typescript_semantic = "\n".join(
        path.read_text() for path in (ROOT / "titmas-typescript-sdk/src").rglob("*.ts")
    )
    assert not any(token in typescript_semantic for token in forbidden_typescript)

    assert LOCK["boundaries"]["handwritten_transport_client"] is False
    assert LOCK["boundaries"]["package_registry_published"] is False
    assert LOCK["boundaries"]["deployment_authorized"] is False


if __name__ == "__main__":
    main()
