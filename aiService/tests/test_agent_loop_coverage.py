"""agent_loop: tool dispatch, JSON hataları, run_with_tools dalları (LLM mock)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch


from app.core.tools.agent_loop import (
    parse_tool_calls,
    _dispatch_one,
    run_with_tools,
)
from app.core.tools.base import ToolRunResult


def test_parse_tool_calls_invalid_json_skipped():
    text = "<tool_call> not json </tool_call>"
    assert parse_tool_calls(text) == []


def test_parse_tool_calls_non_dict_skipped():
    text = "<tool_call>[1,2,3]</tool_call>"
    assert parse_tool_calls(text) == []


def test_dispatch_no_name():
    msg, actions = _dispatch_one({}, None)
    assert "name" in msg.lower()
    assert actions == []


def test_dispatch_args_not_dict():
    msg, _ = _dispatch_one({"name": "x", "args": "bad"}, None)
    assert "object" in msg.lower() or "args" in msg.lower()


def test_dispatch_unknown_tool():
    msg, _ = _dispatch_one({"name": "nonexistent_tool_xyz", "args": {}}, None)
    assert "bilinmeyen" in msg.lower() or "unknown" in msg.lower()


@patch("app.core.tools.registry.get")
def test_dispatch_typeerror(mock_get):
    tool = MagicMock()
    tool.execute.side_effect = TypeError("bad")
    mock_get.return_value = tool
    msg, _ = _dispatch_one({"name": "fake_tool", "args": {}}, {})
    assert "geçersiz" in msg.lower() or "Hata" in msg


@patch("app.core.tools.registry.get")
def test_dispatch_generic_exception(mock_get):
    tool = MagicMock()
    tool.execute.side_effect = RuntimeError("boom")
    mock_get.return_value = tool
    msg, _ = _dispatch_one({"name": "fake_tool", "args": {}}, {})
    assert "çalıştırılamadı" in msg.lower() or "Hata" in msg


def test_normalize_tool_run_result():
    from app.core.tools.agent_loop import _normalize_tool_output

    tr = ToolRunResult(message="m", client_actions=[{"type": "X"}])
    m, a = _normalize_tool_output(tr)
    assert m == "m" and len(a) == 1


def test_normalize_plain_string():
    from app.core.tools.agent_loop import _normalize_tool_output

    m, a = _normalize_tool_output("  hello  ")
    assert m == "hello" and a == []


def test_run_with_tools_cloud_no_tool_calls():
    def cg(text, instr, mode):
        return "düz cevap"

    def lg(u, i, h):
        return "loc"

    ans, acts = run_with_tools(
        llm_provider="cloud",
        mode="flash",
        cloud_prompt="ctx",
        local_instruction="loc",
        local_user_message="u",
        local_history=None,
        cloud_generate=cg,
        local_generate=lg,
    )
    assert ans == "düz cevap"
    assert acts == []


@patch("app.core.tools.agent_loop._dispatch_one")
def test_run_with_tools_cloud_with_tool_second_turn(mock_disp):
    state = {"n": 0}

    def cg(text, instr, mode):
        state["n"] += 1
        if state["n"] == 1:
            return '<tool_call>{"name": "clear_pdfs", "args": {}}</tool_call>'
        return "nihai cevap"

    def lg(u, i, h):
        return "loc"

    mock_disp.return_value = ("tool sonuç", [])
    ans, acts = run_with_tools(
        llm_provider="cloud",
        mode="flash",
        cloud_prompt="ctx",
        local_instruction="loc",
        local_user_message="u",
        local_history=None,
        cloud_generate=cg,
        local_generate=lg,
    )
    assert "nihai" in ans
    mock_disp.assert_called_once()


@patch("app.core.tools.agent_loop._dispatch_one")
def test_run_with_tools_local_with_tool(mock_disp):
    state = {"n": 0}

    def cg(text, instr, mode):
        return "cloud"

    def lg(u, i, h):
        state["n"] += 1
        if state["n"] == 1:
            return '<tool_call>{"name": "clear_pdfs", "args": {}}</tool_call>'
        return "ikinci tur"

    mock_disp.return_value = ("ok", [{"type": "A"}])
    ans, acts = run_with_tools(
        llm_provider="local",
        mode="flash",
        cloud_prompt="ctx",
        local_instruction="loc",
        local_user_message="u",
        local_history=None,
        cloud_generate=cg,
        local_generate=lg,
    )
    assert "ikinci" in ans
    assert acts == [{"type": "A"}]
