"""
Unit tests for local_llm_service.py
"""
import pytest
from unittest.mock import patch, MagicMock
import json

from app.services.local_llm_service import (
    analyze_text_with_local_llm,
    extract_json
)


# ==========================================
# EXTRACT JSON TESTS
# ==========================================

class TestExtractJson:
    """Test extract_json helper function"""
    
    def test_extract_json_valid(self):
        """Test extracting valid JSON from text"""
        text = "Some text before {\"key\": \"value\", \"number\": 123} some text after"
        result = extract_json(text)
        
        assert result is not None
        assert result["key"] == "value"
        assert result["number"] == 123
    
    def test_extract_json_multiline(self):
        """Test extracting multiline JSON"""
        text = """
        Before text
        {
            "corrected_text": "Fixed text",
            "corrections": [
                {"original": "wrong", "corrected": "right"}
            ]
        }
        After text
        """
        result = extract_json(text)
        
        assert result is not None
        assert "corrected_text" in result
        assert len(result["corrections"]) == 1
    
    def test_extract_json_no_json(self):
        """Test extracting JSON when none exists"""
        text = "Just plain text without JSON"
        result = extract_json(text)
        
        assert result is None
    
    def test_extract_json_invalid_json(self):
        """Test extracting invalid JSON"""
        text = "Text with {invalid json syntax"
        result = extract_json(text)
        
        assert result is None


# ==========================================
# ANALYZE TEXT WITH LOCAL LLM TESTS
# ==========================================

class TestAnalyzeTextWithLocalLLM:
    """Test analyze_text_with_local_llm function"""
    
    @patch("app.services.local_llm_service.ollama.Client")
    @patch("app.services.local_llm_service.detect_unknown_words")
    def test_analyze_text_summarize_success(
        self,
        mock_detect_words,
        mock_client_class
    ):
        """Test successful summarization pipeline"""
        # Mock unknown words detection
        mock_detect_words.return_value = ["word1", "word2"]
        
        # Mock Ollama client
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        
        # Mock correction response
        correction_response = MagicMock()
        correction_response["message"] = {"content": '{"corrected_text": "Fixed text", "corrections": []}'}
        mock_client.chat.return_value = correction_response
        
        # Mock summary response
        summary_response = MagicMock()
        summary_response["message"] = {"content": "This is the summary"}
        
        # Make client.chat return different values for correction and summary
        mock_client.chat.side_effect = [correction_response, summary_response]
        
        result = analyze_text_with_local_llm(
            text="Test text with errors",
            task="summarize",
            instruction="Summarize this"
        )
        
        assert "summary" in result
        assert result["summary"] == "This is the summary"
        assert mock_client.chat.call_count == 2  # Correction + Summary
    
    @patch("app.services.local_llm_service.ollama.Client")
    @patch("app.services.local_llm_service.detect_unknown_words")
    def test_analyze_text_summarize_no_corrections(
        self,
        mock_detect_words,
        mock_client_class
    ):
        """Test summarization when no corrections needed"""
        mock_detect_words.return_value = []
        
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        
        correction_response = MagicMock()
        correction_response["message"] = {"content": '{"corrected_text": "Original text", "corrections": []}'}
        
        summary_response = MagicMock()
        summary_response["message"] = {"content": "Summary"}
        
        mock_client.chat.side_effect = [correction_response, summary_response]
        
        result = analyze_text_with_local_llm(
            text="Original text",
            task="summarize"
        )
        
        assert "summary" in result
    
    @patch("app.services.local_llm_service.ollama.Client")
    @patch("app.services.local_llm_service.detect_unknown_words")
    def test_analyze_text_summarize_invalid_json(
        self,
        mock_detect_words,
        mock_client_class
    ):
        """Test summarization when correction returns invalid JSON"""
        mock_detect_words.return_value = []
        
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        
        # Invalid JSON response
        correction_response = MagicMock()
        correction_response["message"] = {"content": "Not valid JSON"}
        
        summary_response = MagicMock()
        summary_response["message"] = {"content": "Summary"}
        
        mock_client.chat.side_effect = [correction_response, summary_response]
        
        result = analyze_text_with_local_llm(
            text="Test text",
            task="summarize"
        )
        
        # Should still produce summary using original text
        assert "summary" in result
    
    @patch("app.services.local_llm_service.ollama.Client")
    def test_analyze_text_chat_success(self, mock_client_class):
        """Test successful chat task"""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        
        chat_response = MagicMock()
        chat_response["message"] = {"content": "Chat response"}
        mock_client.chat.return_value = chat_response
        
        result = analyze_text_with_local_llm(
            text="User message",
            task="chat",
            instruction="Be helpful"
        )
        
        assert "answer" in result
        assert result["answer"] == "Chat response"
        assert mock_client.chat.call_count == 1
    
    @patch("app.services.local_llm_service.ollama.Client")
    def test_analyze_text_chat_default_instruction(self, mock_client_class):
        """Test chat with default instruction"""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        
        chat_response = MagicMock()
        chat_response["message"] = {"content": "Response"}
        mock_client.chat.return_value = chat_response
        
        result = analyze_text_with_local_llm(
            text="Message",
            task="chat"
        )
        
        assert "answer" in result
        # Should use default Turkish instruction
        call_args = mock_client.chat.call_args
        assert "Türkçe" in call_args[1]["messages"][0]["content"]
    
    @patch("app.services.local_llm_service.ollama.Client")
    def test_analyze_text_chat_exception(self, mock_client_class):
        """Test chat when Ollama raises exception"""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_client.chat.side_effect = Exception("Connection error")
        
        result = analyze_text_with_local_llm(
            text="Message",
            task="chat"
        )
        
        assert "answer" in result
        assert "hatası" in result["answer"] or "error" in result["answer"].lower()
    
    @patch("app.services.local_llm_service.ollama.Client")
    @patch("app.services.local_llm_service.detect_unknown_words")
    def test_analyze_text_summarize_exception_during_detection(
        self,
        mock_detect_words,
        mock_client_class
    ):
        """Test summarization when word detection raises exception"""
        mock_detect_words.side_effect = Exception("Detection error")
        
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        
        correction_response = MagicMock()
        correction_response["message"] = {"content": '{"corrected_text": "Text", "corrections": []}'}
        
        summary_response = MagicMock()
        summary_response["message"] = {"content": "Summary"}
        
        mock_client.chat.side_effect = [correction_response, summary_response]
        
        result = analyze_text_with_local_llm(
            text="Test",
            task="summarize"
        )
        
        # Should still work, using "Hata" for suspects_str
        assert "summary" in result
    
    @patch("app.services.local_llm_service.ollama.Client")
    @patch("app.services.local_llm_service.detect_unknown_words")
    def test_analyze_text_summarize_timeout(
        self,
        mock_detect_words,
        mock_client_class
    ):
        """Test summarization timeout handling"""
        mock_detect_words.return_value = []
        
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        
        # Simulate timeout exception
        import time
        mock_client.chat.side_effect = TimeoutError("Request timeout")
        
        result = analyze_text_with_local_llm(
            text="Test text",
            task="summarize"
        )
        
        # Should return error message
        assert "summary" in result
        assert "hata" in result["summary"].lower() or "error" in result["summary"].lower()
