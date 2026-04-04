"""ai_service tam kapsam: Gemini ve yerel LLM tamamen mock (ağ yok)."""

from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

import app.services.ai_service as ai


class TestRequireCloudAndLocalHelpers:
    def test_local_llm_configured_reads_env(self, monkeypatch):
        monkeypatch.setenv("LOCAL_LLM_URL", "http://localhost:11434/v1")
        assert ai._local_llm_configured() is True
        monkeypatch.delenv("LOCAL_LLM_URL", raising=False)

    def test_gemini_via_local_openai(self):
        with patch(
            "app.services.local_llm_service.analyze_text_with_local_llm",
            return_value={"answer": "ok", "summary": ""},
        ):
            assert ai._gemini_via_local_openai("t", "instr") == "ok"

    def test_gemini_via_local_prefers_summary(self):
        with patch(
            "app.services.local_llm_service.analyze_text_with_local_llm",
            return_value={"answer": "", "summary": " s "},
        ):
            assert ai._gemini_via_local_openai("t", "i") == "s"

    def test_require_cloud_raises_503(self):
        with patch.object(ai, "flash_model", None), patch.object(ai, "pro_model", None):
            with pytest.raises(HTTPException) as e:
                ai._require_cloud()
            assert e.value.status_code == 503


class TestQuotaHelpers:
    def test_is_quota_or_rate_limit(self):
        assert ai._is_quota_or_rate_limit_error(Exception("429 too many"))
        assert ai._is_quota_or_rate_limit_error(Exception("Quota exceeded"))
        assert ai._is_quota_or_rate_limit_error(Exception("Rate LIMIT x"))
        assert not ai._is_quota_or_rate_limit_error(Exception("other"))

    def test_is_quota_exceeded_permanent(self):
        assert ai._is_quota_exceeded_error(Exception("quota exceeded"))
        assert ai._is_quota_exceeded_error(Exception("limit: 0"))
        assert ai._is_quota_exceeded_error(Exception("free_tier quota"))
        assert ai._is_quota_exceeded_error(Exception("exceeded your current quota"))
        assert not ai._is_quota_exceeded_error(Exception("429"))


class TestGeminiGenerateLocal:
    @patch.object(ai, "_local_llm_configured", return_value=True)
    @patch.object(ai, "_gemini_via_local_openai", return_value="local out")
    def test_local_path(self, _mock_g, _mock_l):
        assert ai.gemini_generate("hello", "instr") == "local out"

    @patch.object(ai, "_local_llm_configured", return_value=True)
    def test_local_empty_raises(self, _mock_l):
        with pytest.raises(HTTPException) as e:
            ai.gemini_generate("", "x")
        assert e.value.status_code == 400


class TestGeminiGenerateCloud:
    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    def test_empty_body_400(self, _req, _loc):
        with pytest.raises(HTTPException) as e:
            ai.gemini_generate("", "i", mode="flash")
        assert e.value.status_code == 400

    def _resp(self, text="ok", has_candidates=True):
        r = MagicMock()
        r.text = text
        if has_candidates:
            r.candidates = [MagicMock()]
        else:
            r.candidates = None
        return r

    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    @patch.object(ai, "_generate_with_retry")
    def test_success_flash(self, mock_gr, _req, _loc):
        mock_gr.return_value = self._resp("yay")
        ai.flash_model = MagicMock()
        ai.pro_model = MagicMock()
        out = ai.gemini_generate("text", "instr", mode="flash")
        assert out == "yay"

    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    @patch.object(ai, "_generate_with_retry")
    def test_truncates_long_input(self, mock_gr, _req, _loc):
        mock_gr.return_value = self._resp("x")
        long_t = "a" * 60000
        ai.gemini_generate(long_t, "i", mode="flash")
        call_text = mock_gr.call_args[0][1]
        assert "METİN" in mock_gr.call_args[0][1] or len(call_text) < len(long_t) + 100

    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    @patch.object(ai, "_generate_with_retry")
    def test_no_candidates_400(self, mock_gr, _req, _loc):
        mock_gr.return_value = self._resp(has_candidates=False)
        with pytest.raises(HTTPException) as e:
            ai.gemini_generate("t", "i", mode="flash")
        assert e.value.status_code == 400

    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    @patch.object(ai, "_generate_with_retry")
    def test_pro_fallback_on_rate_limit(self, mock_gr, _req, _loc):
        def side_effect(model, prompt, attempts=5):
            if mock_gr.call_count <= 1:
                raise Exception("rate limit 429")
            return self._resp("flash ok")

        mock_gr.side_effect = side_effect
        out = ai.gemini_generate("t", "i", mode="pro")
        assert out == "flash ok"

    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    @patch.object(ai, "_generate_with_retry")
    def test_pro_non_rate_limit_reraises(self, mock_gr, _req, _loc):
        mock_gr.side_effect = ValueError("boom")
        with pytest.raises(ValueError):
            ai.gemini_generate("t", "i", mode="pro")

    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    @patch.object(ai, "_generate_with_retry")
    def test_pro_success_first_try(self, mock_gr, _req, _loc):
        mock_gr.return_value = self._resp("pro ok")
        out = ai.gemini_generate("text", "i", mode="pro")
        assert out == "pro ok"

    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    @patch.object(ai, "_generate_with_retry")
    def test_generic_exception_rate_maps_429(self, mock_gr, _req, _loc):
        mock_gr.side_effect = Exception("rate limit soft")
        with pytest.raises(HTTPException) as e:
            ai.gemini_generate("t", "i", mode="flash")
        assert e.value.status_code == 429

    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    @patch.object(ai, "_generate_with_retry")
    def test_generic_exception_500(self, mock_gr, _req, _loc):
        mock_gr.side_effect = Exception("weird")
        with pytest.raises(HTTPException) as e:
            ai.gemini_generate("t", "i", mode="flash")
        assert e.value.status_code == 500


class TestGenerateWithRetry:
    def test_quota_exceeded_raises_http(self):
        m = MagicMock()
        m.generate_content.side_effect = Exception("quota exceeded limit: 0")
        with pytest.raises(HTTPException) as e:
            ai._generate_with_retry(m, "p", attempts=2)
        assert e.value.status_code == 429

    @patch("app.services.ai_service.time.sleep", return_value=None)
    def test_rate_limit_then_ok(self, _sleep):
        m = MagicMock()
        m.generate_content.side_effect = [
            Exception("429"),
            MagicMock(candidates=[1], text="ok"),
        ]
        r = ai._generate_with_retry(m, "p", attempts=3)
        assert r.text == "ok"

    @patch("app.services.ai_service.time.sleep", return_value=None)
    def test_exhaust_retries(self, _sleep):
        m = MagicMock()
        m.generate_content.side_effect = Exception("429 rate limit")
        with pytest.raises(Exception):
            ai._generate_with_retry(m, "p", attempts=2)

    def test_non_rate_error_reraises_immediately(self):
        m = MagicMock()
        m.generate_content.side_effect = ValueError("bad")
        with pytest.raises(ValueError):
            ai._generate_with_retry(m, "p", attempts=3)


class TestCallGeminiForTask:
    @patch.object(ai, "_local_llm_configured", return_value=True)
    @patch.object(ai, "_gemini_via_local_openai", return_value="L")
    def test_local(self, *_):
        assert ai.call_gemini_for_task("body", "p") == "L"

    @patch.object(ai, "_local_llm_configured", return_value=True)
    def test_local_whitespace_raises(self, _mock):
        with pytest.raises(HTTPException) as e:
            ai.call_gemini_for_task("  \n  ", "p")
        assert e.value.status_code == 400

    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    def test_cloud_empty_whitespace_raises(self, _req, _loc):
        with pytest.raises(HTTPException) as e:
            ai.call_gemini_for_task("  \n\t  ", "p")
        assert e.value.status_code == 400

    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    @patch.object(ai, "_generate_with_retry")
    def test_cloud_pro_then_flash(self, mock_gr, _req, _loc):
        ai.flash_model = MagicMock()
        ai.pro_model = MagicMock()
        pro_r = MagicMock()
        pro_r.text = "from pro"
        pro_r.candidates = [1]
        mock_gr.return_value = pro_r
        assert ai.call_gemini_for_task("hello", "p") == "from pro"

    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    @patch.object(ai, "_generate_with_retry")
    def test_cloud_pro_fails_rate_flash_ok(self, mock_gr, _req, _loc):
        ai.flash_model = MagicMock()
        ai.pro_model = MagicMock()
        flash_m = MagicMock(candidates=[1], text="f")
        mock_gr.side_effect = [
            Exception("rate limit"),
            flash_m,
        ]
        assert ai.call_gemini_for_task("x", "y") == "f"

    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    @patch.object(ai, "_generate_with_retry")
    def test_cloud_flash_no_text_raises_400(self, mock_gr, _req, _loc):
        ai.flash_model = MagicMock()
        ai.pro_model = MagicMock()
        mock_gr.side_effect = [
            MagicMock(candidates=[]),
            MagicMock(candidates=None, text=None),
        ]
        with pytest.raises(HTTPException) as e:
            ai.call_gemini_for_task("x", "y")
        # İçteki 400, dış except ile 500'e sarılır
        assert e.value.status_code == 500
        assert "AI yanıt üretmedi" in str(e.value.detail)

    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    @patch.object(ai, "_generate_with_retry")
    def test_cloud_flash_rate_429(self, mock_gr, _req, _loc):
        ai.flash_model = MagicMock()
        ai.pro_model = MagicMock()
        mock_gr.side_effect = [
            MagicMock(candidates=[]),
            Exception("rate limit 429"),
        ]
        with pytest.raises(HTTPException) as e:
            ai.call_gemini_for_task("x", "y")
        assert e.value.status_code == 429

    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    @patch.object(ai, "_generate_with_retry")
    def test_long_text_truncated_in_task(self, mock_gr, _req, _loc):
        ai.flash_model = MagicMock()
        ai.pro_model = MagicMock()
        mock_gr.return_value = MagicMock(candidates=[1], text="ok")
        long_b = "z" * 60000
        ai.call_gemini_for_task(long_b, "p")
        assert len(mock_gr.call_args[0][1]) < len(long_b) + 50

    @patch.object(ai, "_local_llm_configured", return_value=False)
    @patch.object(ai, "_require_cloud")
    @patch.object(ai, "_generate_with_retry")
    def test_pro_raises_non_rate_propagates(self, mock_gr, _req, _loc):
        ai.flash_model = MagicMock()
        ai.pro_model = MagicMock()
        mock_gr.side_effect = ValueError("not rate")
        with pytest.raises(ValueError):
            ai.call_gemini_for_task("x", "y")


class TestSessions:
    def setup_method(self):
        ai._PDF_CHAT_SESSIONS.clear()
        ai._GENERAL_CHAT_SESSIONS.clear()

    def test_create_and_cleanup_expired(self):
        old_id = "old"
        ai._PDF_CHAT_SESSIONS[old_id] = {
            "text": "t",
            "filename": "f.pdf",
            "history": [],
            "created_at": time.time() - 7200,
            "llm_provider": "cloud",
            "mode": "flash",
        }
        ai._cleanup_sessions()
        assert old_id not in ai._PDF_CHAT_SESSIONS

        sid = ai.create_pdf_chat_session(
            "txt", filename="a.pdf", llm_provider="local", pdf_id="p", user_id="u"
        )
        assert sid in ai._PDF_CHAT_SESSIONS
        assert ai._PDF_CHAT_SESSIONS[sid]["pdf_id"] == "p"

    def test_restore_filters_history(self):
        ai.restore_pdf_chat_session(
            "sid",
            "text",
            history=[
                "bad",
                {"role": "user", "content": "u"},
                {"role": "assistant", "content": "a"},
                {"role": "system", "content": "x"},
                {"role": "user", "content": None},
            ],
        )
        h = ai._PDF_CHAT_SESSIONS["sid"]["history"]
        assert len(h) == 2

    def test_general_chat_session(self):
        gid = ai.create_general_chat_session("cloud", "pro")
        assert gid in ai._GENERAL_CHAT_SESSIONS
        ai._GENERAL_CHAT_SESSIONS[gid]["created_at"] = time.time() - 99999
        ai._cleanup_sessions()
        assert gid not in ai._GENERAL_CHAT_SESSIONS
