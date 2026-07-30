from __future__ import annotations

from typing import cast

from titmas_agent_sdk import TitmasClient

from titmas_openai_agents import build_titmas_tools


class _FakeClient:
    pass


def test_openai_agent_tools_are_bounded_and_agent_readable() -> None:
    tools = build_titmas_tools(cast(TitmasClient, _FakeClient()))
    assert [tool.name for tool in tools] == [
        "titmas_preflight",
        "titmas_verify_receipt",
        "titmas_quota",
    ]
    descriptions = " ".join(tool.description for tool in tools)
    assert "NOT_ASSESSED" in descriptions
    assert "not truth or authority" in descriptions
