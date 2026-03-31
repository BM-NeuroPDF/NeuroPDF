"""MergePdfTool: client-side merge signal (MERGE_PDFS_LOCAL)."""

from app.core.tools.base import ToolRunResult
from app.core.tools.merge_tool import MergePdfTool


def test_merge_pdfs_tool_returns_merge_pdfs_local_action():
    tool = MergePdfTool()
    out = tool.execute(_tool_context={})
    assert isinstance(out, ToolRunResult)
    assert "birleştir" in out.message.lower() or "sinyal" in out.message.lower()
    assert len(out.client_actions) == 1
    assert out.client_actions[0]["type"] == "MERGE_PDFS_LOCAL"
    assert out.client_actions[0]["payload"] == {}


def test_merge_pdfs_tool_ignores_extra_kwargs():
    tool = MergePdfTool()
    out = tool.execute(foo="bar", _tool_context={})
    assert isinstance(out, ToolRunResult)
    assert out.client_actions[0]["type"] == "MERGE_PDFS_LOCAL"
