# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 zhangbin
"""离线合成响应演示：复用现有 SDK，不调用模型、网络或私有核心。"""
from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

from titmas_agent_sdk import TitmasClient
from titmas_api_client.api.default_api import DefaultApi
from titmas_api_client.models.preflight_result import PreflightResult

FIXTURE = Path(__file__).resolve().with_name("responses.json")
LABELS = {"PASS": "通过（仅本样例预设检查）", "FAIL": "未通过", "NOT_ASSESSED": "尚未评估"}


class FixtureApi:
    """只返回明确预设的响应，不模拟业务判断或签名验证。"""

    def __init__(self, response: PreflightResult) -> None:
        self.response = response
        self.calls = 0

    def titmas_preflight_sync(self, **kwargs: Any) -> PreflightResult:
        self.calls += 1
        if kwargs["preflight_request"].request_id != self.response.request_id:
            raise ValueError("合成请求与响应不匹配")
        return self.response


def build_report(fixture_path: Path = FIXTURE) -> dict[str, Any]:
    data = json.loads(fixture_path.read_text(encoding="utf-8"))
    if data["kind"] != "SYNTHETIC_PRESET_RESPONSES":
        raise ValueError("只接受明确标注的合成响应夹具")
    if len(data["cases"]) != 3:
        raise ValueError("本演示仅包含三个冻结响应")
    results = []
    for item in data["cases"]:
        response = PreflightResult.model_validate(item["response"])
        fake = FixtureApi(response)
        # 不读取环境变量；这个值仅满足本地 SDK 入参要求，没有真实权限。
        with TitmasClient(
            base_url="https://example.invalid",
            credential="SYNTHETIC_NOT_A_CREDENTIAL",
            credential_id="synthetic-credential-id",
            generated_api=cast(DefaultApi, fake),
        ) as client:
            payload = {"case_id": item["case_id"], "synthetic": True}
            digest = hashlib.sha256(
                json.dumps(payload, sort_keys=True).encode("utf-8")
            ).hexdigest()
            outcome = client.preflight(
                request_id=response.request_id,
                idempotency_key=response.request_id,
                tenant_id="synthetic-tenant",
                agent_identity="synthetic-agent",
                schema_id="synthetic-display-only",
                schema_version="fixture-v1",
                object_value=payload,
                object_digest=digest,
                timestamp=datetime(2026, 10, 6, tzinfo=UTC),
            )
        results.append({
            "case_id": item["case_id"],
            "explanation_zh": item["explanation_zh"],
            "display_zh": LABELS[outcome.result],
            "sdk_call_count": fake.calls,
            "outcome": asdict(outcome),
        })
    return {
        "kind": "SYNTHETIC_SDK_RESPONSE_HANDLING_DEMO",
        "business_correctness_assessed": False,
        "live_service_used": False,
        "receipt_signature_verified": False,
        "permission_granted": False,
        "cases": results,
        "limitations_zh": [
            "响应为预设，不是 AI 审阅或私有评测内核运行结果。",
            "演示只证明 SDK 能保留三种结果及其非授权边界。",
            "回执 ID 为合成占位符，未签名、未验证、未写入服务器。",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="TITMAS 无密钥离线合成样例")
    parser.add_argument("--json", action="store_true", help="输出完整机器可读结果")
    args = parser.parse_args()
    report = build_report()
    if args.json:
        print(json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2))
        return
    print("TITMAS：三个预设响应，离线检查 SDK 如何解释结果")
    for case in report["cases"]:
        print(f'{case["case_id"]}：{case["display_zh"]}')
        print(f'  {case["explanation_zh"]}')
    print("不是语义评测、真实回执验证或自动授权。完整结果请加 --json。")


if __name__ == "__main__":
    main()
