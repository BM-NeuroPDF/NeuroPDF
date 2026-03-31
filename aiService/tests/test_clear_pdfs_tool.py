"""ClearPdfsTool: client-side clear signal (CLEAR_ALL_PDFS)."""

from app.core.tools.base import ToolRunResult
from app.core.tools.clear_tool import ClearPdfsTool


def test_clear_pdfs_tool_returns_clear_all_pdfs_action():
    tool = ClearPdfsTool()
    out = tool.execute(_tool_context={})
    assert isinstance(out, ToolRunResult)
    assert "temizle" in out.message.lower() or "sinyal" in out.message.lower()
    assert len(out.client_actions) == 1
    assert out.client_actions[0]["type"] == "CLEAR_ALL_PDFS"
    assert out.client_actions[0]["payload"] == {}
