"""TranslatePdfTool: in-process translation using tool_context full_text."""

from unittest.mock import patch

from app.core.tools.translate_tool import TranslatePdfTool


def test_translate_pdf_tool_no_text_returns_error():
    tool = TranslatePdfTool()
    out = tool.execute(target_language="İngilizce", _tool_context={})
    assert "Hata" in out
    assert "PDF metni" in out or "bulunamadı" in out


def test_translate_pdf_tool_empty_full_text_returns_error():
    tool = TranslatePdfTool()
    out = tool.execute(
        target_language="Almanca",
        _tool_context={"full_text": "   "},
    )
    assert "Hata" in out


def test_translate_pdf_tool_missing_target_language():
    tool = TranslatePdfTool()
    out = tool.execute(_tool_context={"full_text": "Merhaba dünya"})
    assert "Hata" in out
    assert "dil" in out.lower() or "target_language" in out.lower()


def test_translate_pdf_tool_empty_target_language():
    tool = TranslatePdfTool()
    out = tool.execute(
        target_language="",
        _tool_context={"full_text": "İçerik"},
    )
    assert "Hata" in out


@patch("app.services.llm_manager._cloud_generate", return_value="Hello world.")
def test_translate_pdf_tool_cloud_calls_generate(mock_cloud):
    tool = TranslatePdfTool()
    ctx = {
        "full_text": "Merhaba dünya.",
        "llm_provider": "cloud",
        "mode": "flash",
    }
    out = tool.execute(target_language="İngilizce", _tool_context=ctx)
    assert out == "Hello world."
    mock_cloud.assert_called_once()
    args, _kwargs = mock_cloud.call_args
    assert "Merhaba" in args[0]
    assert "İngilizce" in args[1]


@patch("app.services.llm_manager._local_chat_generate", return_value="Hallo.")
def test_translate_pdf_tool_local_calls_generate(mock_local):
    tool = TranslatePdfTool()
    ctx = {
        "full_text": "Text",
        "llm_provider": "local",
        "mode": "pro",
    }
    out = tool.execute(target_language="Almanca", _tool_context=ctx)
    assert out == "Hallo."
    mock_local.assert_called_once()
