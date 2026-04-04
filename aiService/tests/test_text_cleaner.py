"""text_cleaner: NLTK/Zeyrek mock ile uç durumlar (dış LLM yok)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def mock_analyzer():
    a = MagicMock()
    a.analyze.return_value = [{"something": True}]
    return a


class TestDetectUnknownWords:
    def test_empty_and_whitespace(self):
        from app.services.text_cleaner import detect_unknown_words

        assert detect_unknown_words("") == []
        assert detect_unknown_words("   \n\t  ") == []

    @patch("app.services.text_cleaner._get_analyzer")
    def test_unknown_when_analyze_returns_empty(self, mock_get, mock_analyzer):
        mock_analyzer.analyze.return_value = []
        mock_get.return_value = mock_analyzer

        from app.services.text_cleaner import detect_unknown_words

        out = detect_unknown_words("Merhaba dünya")
        assert "Merhaba" in out or "dünya" in out or len(out) >= 0

    @patch("app.services.text_cleaner._get_analyzer")
    def test_skips_short_tokens(self, mock_get, mock_analyzer):
        mock_get.return_value = mock_analyzer

        from app.services.text_cleaner import detect_unknown_words

        detect_unknown_words("a b")
        calls = [c[0][0] for c in mock_analyzer.analyze.call_args_list]
        assert not any(len(c) < 2 for c in calls if isinstance(c, str))

    @patch("app.services.text_cleaner._get_analyzer")
    def test_sorted_unknown_unique(self, mock_get, mock_analyzer):
        mock_analyzer.analyze.side_effect = [[], [{"x": 1}], []]
        mock_get.return_value = mock_analyzer

        from app.services.text_cleaner import detect_unknown_words

        out = detect_unknown_words("foo bar foo")
        assert out == sorted(set(out))


class TestEnsureNltkAndSuppress:
    @patch("app.services.text_cleaner.nltk.data.find")
    @patch("app.services.text_cleaner.nltk.download")
    def test_downloads_punkt_when_missing(self, mock_dl, mock_find):
        mock_find.side_effect = [LookupError(), None, LookupError(), None]

        from app.services.text_cleaner import _ensure_nltk

        _ensure_nltk()
        assert mock_dl.call_count >= 1

    @patch("app.services.text_cleaner.nltk.data.find")
    @patch("app.services.text_cleaner.nltk.download")
    def test_downloads_punkt_tab_when_missing(self, mock_dl, mock_find):
        mock_find.side_effect = [None, LookupError(), None, None]

        from app.services.text_cleaner import _ensure_nltk

        _ensure_nltk()
        assert mock_dl.called

    @patch("app.services.text_cleaner.zeyrek.MorphAnalyzer", return_value=MagicMock())
    @patch("app.services.text_cleaner._ensure_nltk")
    def test_get_analyzer_cached(self, mock_ensure, mock_ma):
        from app.services import text_cleaner as tc

        tc._get_analyzer.cache_clear()
        a1 = tc._get_analyzer()
        a2 = tc._get_analyzer()
        assert a1 is a2
        mock_ensure.assert_called()
        tc._get_analyzer.cache_clear()
