"""ExtractPagesTool: client-side extract signal (EXTRACT_PAGES_LOCAL)."""

import pytest

from app.core.tools.base import ToolRunResult
from app.core.tools.extract_tool import ExtractPagesTool


def test_execute_invalid_range_end_before_start():
    tool = ExtractPagesTool()
    out = tool.execute(start_page=5, end_page=1, _tool_context={})
    assert isinstance(out, str)
    assert "Hata" in out
    assert "geçersiz" in out.lower()


def test_execute_success_returns_extract_pages_local_action():
    tool = ExtractPagesTool()
    out = tool.execute(start_page=2, end_page=4, _tool_context={})
    assert isinstance(out, ToolRunResult)
    assert "tarayıcı" in out.message.lower() or "sinyal" in out.message.lower()
    assert len(out.client_actions) == 1
    assert out.client_actions[0]["type"] == "EXTRACT_PAGES_LOCAL"
    assert out.client_actions[0]["payload"] == {"start_page": 2, "end_page": 4}


@pytest.mark.parametrize("start,end", [(0, 1), (1, 0)])
def test_execute_invalid_page_numbers(start, end):
    tool = ExtractPagesTool()
    out = tool.execute(start_page=start, end_page=end, _tool_context={})
    assert isinstance(out, str)
    assert "Hata" in out
