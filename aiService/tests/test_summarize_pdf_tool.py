"""SummarizePdfTool: in-process summary using tool_context full_text."""

from unittest.mock import patch

from app.core.tools.summarize_tool import SummarizePdfTool


def test_summarize_pdf_tool_no_text_returns_error():
    tool = SummarizePdfTool()
    out = tool.execute(_tool_context={})
    assert "Hata" in out
    assert "PDF metni" in out or "bulunamadı" in out


def test_summarize_pdf_tool_empty_full_text_returns_error():
    tool = SummarizePdfTool()
    out = tool.execute(_tool_context={"full_text": "   "})
    assert "Hata" in out


@patch("app.services.llm_manager._cloud_generate", return_value="Özet metni.")
def test_summarize_pdf_tool_cloud_calls_generate(mock_cloud):
    tool = SummarizePdfTool()
    ctx = {
        "full_text": "Uzun bir PDF metni içeriği burada.",
        "llm_provider": "cloud",
        "mode": "flash",
    }
    out = tool.execute(format="3 maddelik", _tool_context=ctx)
    assert out == "Özet metni."
    mock_cloud.assert_called_once()
    args, kwargs = mock_cloud.call_args
    assert "3 maddelik" in args[1]
    assert "Uzun bir PDF" in args[0]


@patch("app.services.llm_manager._local_chat_generate", return_value="Local özet.")
def test_summarize_pdf_tool_local_calls_generate(mock_local):
    tool = SummarizePdfTool()
    ctx = {
        "full_text": "İçerik",
        "llm_provider": "local",
        "mode": "pro",
    }
    out = tool.execute(_tool_context=ctx)
    assert out == "Local özet."
    mock_local.assert_called_once()


def test_summarize_pdf_tool_default_format_genel():
    tool = SummarizePdfTool()
    ctx = {"full_text": "x", "llm_provider": "cloud", "mode": "flash"}
    with patch("app.services.llm_manager._cloud_generate", return_value="ok") as m:
        tool.execute(_tool_context=ctx)
    assert "genel" in m.call_args[0][1]
