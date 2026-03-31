"""Tests for <tool_call> parsing."""

from app.core.tools.agent_loop import parse_tool_calls, run_with_tools


def test_parse_valid_single():
    text = 'Hello <tool_call>{"name": "extract_pages", "args": {"start_page": 1, "end_page": 3}}</tool_call>'
    calls = parse_tool_calls(text)
    assert len(calls) == 1
    assert calls[0]["name"] == "extract_pages"
    assert calls[0]["args"] == {"start_page": 1, "end_page": 3}


def test_parse_arguments_alias():
    text = '<tool_call>{"name": "x", "arguments": {"a": 1}}</tool_call>'
    calls = parse_tool_calls(text)
    assert len(calls) == 1


def test_parse_invalid_json_skipped():
    text = "<tool_call>not json</tool_call>"
    assert parse_tool_calls(text) == []


def test_parse_multiple_tags():
    text = (
        '<tool_call>{"name": "a", "args": {}}</tool_call> '
        '<tool_call>{"name": "b", "args": {}}</tool_call>'
    )
    calls = parse_tool_calls(text)
    assert len(calls) == 2
    assert calls[0]["name"] == "a"
    assert calls[1]["name"] == "b"


def test_run_with_tools_no_tool_returns_raw():
    def cloud_gen(t, i, m):
        return "Düz Türkçe cevap."

    text, actions = run_with_tools(
        llm_provider="cloud",
        mode="flash",
        cloud_prompt="ctx",
        local_instruction="",
        local_user_message="",
        local_history=None,
        tool_context=None,
        cloud_generate=cloud_gen,
        local_generate=lambda u, ins, h: "",
    )
    assert text == "Düz Türkçe cevap."
    assert actions == []


def test_run_with_tools_second_turn_cloud_extract_local():
    calls = {"n": 0}

    def cloud_gen(t, i, m):
        calls["n"] += 1
        if calls["n"] == 1:
            return '<tool_call>{"name": "extract_pages", "args": {"start_page": 1, "end_page": 2}}</tool_call>'
        return "Sayfalar ayrıldı, işlem tamam."

    text, actions = run_with_tools(
        llm_provider="cloud",
        mode="flash",
        cloud_prompt="PDF hakkında soru",
        local_instruction="",
        local_user_message="",
        local_history=None,
        tool_context=None,
        cloud_generate=cloud_gen,
        local_generate=lambda u, ins, h: "",
    )
    assert calls["n"] == 2
    assert "işlem tamam" in text
    assert any(a.get("type") == "EXTRACT_PAGES_LOCAL" for a in actions)
    pl = next(a["payload"] for a in actions if a.get("type") == "EXTRACT_PAGES_LOCAL")
    assert pl == {"start_page": 1, "end_page": 2}
