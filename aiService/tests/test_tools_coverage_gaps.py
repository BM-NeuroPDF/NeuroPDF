"""Araç sınıfları: kalan dallar (LLM mock)."""

from __future__ import annotations

from unittest.mock import patch


from app.core.tools.extract_tool import ExtractPagesTool
from app.core.tools.swap_pages_tool import SwapPagesTool
from app.core.tools.summarize_tool import SummarizePdfTool
from app.core.tools.translate_tool import TranslatePdfTool


class TestExtractPagesTool:
    def test_invalid_int_args(self):
        t = ExtractPagesTool()
        r = t.execute(start_page="x", end_page=1)
        assert "tam sayı" in r.lower() or "geçerli" in r.lower()

    def test_invalid_range_end_before_start(self):
        t = ExtractPagesTool()
        r = t.execute(start_page=3, end_page=1)
        assert "küçük" in r.lower() or "geçersiz" in r.lower()


class TestSwapPagesTool:
    def test_invalid_int_conversion(self):
        t = SwapPagesTool()
        r = t.execute(page_a="nope", page_b=2)
        assert "tam sayı" in r.lower()

    def test_pages_below_one(self):
        t = SwapPagesTool()
        r = t.execute(page_a=0, page_b=1)
        assert "1 veya daha büyük" in r

    def test_same_page(self):
        t = SwapPagesTool()
        r = t.execute(page_a=2, page_b=2)
        assert "Aynı sayfa" in r


class TestSummarizePdfTool:
    @patch("app.services.llm_manager._cloud_generate", return_value="özet")
    def test_cloud_branch(self, _cg):
        t = SummarizePdfTool()
        out = t.execute(
            format="kısa",
            _tool_context={
                "full_text": "Uzun metin içerik.",
                "llm_provider": "cloud",
                "mode": "flash",
            },
        )
        assert out == "özet"

    @patch("app.services.llm_manager._local_chat_generate", return_value="yerel")
    def test_local_branch(self, _lg):
        t = SummarizePdfTool()
        out = t.execute(
            _tool_context={
                "full_text": "Metin.",
                "llm_provider": "local",
                "mode": "flash",
            },
        )
        assert out == "yerel"

    def test_invalid_provider(self):
        t = SummarizePdfTool()
        out = t.execute(_tool_context={"full_text": "x", "llm_provider": "bogus"})
        assert "Geçersiz" in out or "llm" in out.lower()

    def test_context_not_dict_becomes_empty(self):
        t = SummarizePdfTool()
        out = t.execute(_tool_context="not a dict")  # type: ignore[arg-type]
        assert "bulunamadı" in out or "PDF" in out

    @patch("app.services.llm_manager._cloud_generate", return_value="x")
    def test_format_none_defaults_genel(self, _cg):
        t = SummarizePdfTool()
        t.execute(
            format=None, _tool_context={"full_text": "abc", "llm_provider": "cloud"}
        )
        _cg.assert_called_once()

    @patch("app.services.llm_manager._cloud_generate", return_value="x")
    def test_format_non_string_defaults(self, _cg):
        t = SummarizePdfTool()
        t.execute(
            format=123, _tool_context={"full_text": "abc", "llm_provider": "cloud"}
        )


class TestTranslatePdfTool:
    def test_missing_target_language(self):
        t = TranslatePdfTool()
        r = t.execute(_tool_context={"full_text": "hi"})
        assert "Hedef dil" in r

    @patch("app.services.llm_manager._cloud_generate", return_value="translated")
    def test_cloud_ok(self, _cg):
        t = TranslatePdfTool()
        r = t.execute(
            target_language="English",
            _tool_context={"full_text": "Merhaba", "llm_provider": "cloud"},
        )
        assert r == "translated"

    @patch("app.services.llm_manager._local_chat_generate", return_value="loc tr")
    def test_local_branch(self, _lg):
        t = TranslatePdfTool()
        r = t.execute(
            target_language="DE",
            _tool_context={"full_text": "Hi", "llm_provider": "local"},
        )
        assert r == "loc tr"

    def test_invalid_llm_provider(self):
        t = TranslatePdfTool()
        r = t.execute(
            target_language="EN",
            _tool_context={"full_text": "x", "llm_provider": "bad"},
        )
        assert "Geçersiz" in r

    def test_context_not_dict(self):
        t = TranslatePdfTool()
        r = t.execute(target_language="EN", _tool_context="bad")  # type: ignore[arg-type]
        assert "bulunamadı" in r or "Hata" in r

    def test_lang_not_string_coerced(self):
        t = TranslatePdfTool()
        with patch("app.services.llm_manager._cloud_generate", return_value="ok"):
            r = t.execute(
                target_language=123,
                _tool_context={"full_text": "a", "llm_provider": "cloud"},
            )  # type: ignore[arg-type]
        assert r == "ok"
