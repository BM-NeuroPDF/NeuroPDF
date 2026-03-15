"""
Unit tests for local_llm_service.py
"""
import pytest
from unittest.mock import patch, MagicMock
import json

from app.services.local_llm_service import (
    analyze_text_with_local_llm
)


# ==========================================
# ANALYZE TEXT WITH LOCAL LLM TESTS
# ==========================================

class TestAnalyzeTextWithLocalLLM:
    """Test analyze_text_with_local_llm function"""
    
    @patch("app.services.local_llm_service.ollama.Client")
    def test_analyze_text_summarize_success(
        self,
        mock_client_class
    ):
        """Test successful summarization pipeline"""
        # Mock Ollama client
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        
        # Mock summary response (now single step: correct + summarize)
        # Response should be a dict-like object: {"message": {"content": "..."}}
        summary_response = {"message": {"content": "This is the summary"}}
        mock_client.chat.return_value = summary_response
        
        result = analyze_text_with_local_llm(
            text="Test text with errors",
            task="summarize",
            instruction="Summarize this"
        )
        
        assert "summary" in result
        assert result["summary"] == "This is the summary"
        assert "corrections" in result
        assert mock_client.chat.call_count == 1  # Single step: correct + summarize
    
    @patch("app.services.local_llm_service.ollama.Client")
    def test_analyze_text_summarize_no_corrections(
        self,
        mock_client_class
    ):
        """Test summarization when no corrections needed"""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        
        summary_response = {"message": {"content": "Summary"}}
        mock_client.chat.return_value = summary_response
        
        result = analyze_text_with_local_llm(
            text="Original text",
            task="summarize"
        )
        
        assert "summary" in result
        assert result["summary"] == "Summary"
    
    @patch("app.services.local_llm_service.ollama.Client")
    def test_analyze_text_summarize_invalid_json(
        self,
        mock_client_class
    ):
        """Test summarization returns summary directly (no JSON parsing needed)"""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        
        # Summary response (no JSON parsing needed anymore)
        summary_response = {"message": {"content": "Summary text"}}
        mock_client.chat.return_value = summary_response
        
        result = analyze_text_with_local_llm(
            text="Test text",
            task="summarize"
        )
        
        # Should produce summary directly
        assert "summary" in result
        assert result["summary"] == "Summary text"
    
    @patch("app.services.local_llm_service.ollama.Client")
    def test_analyze_text_chat_success(self, mock_client_class):
        """Test successful chat task"""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        
        chat_response = {"message": {"content": "Chat response"}}
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
        
        chat_response = {"message": {"content": "Response"}}
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
    def test_analyze_text_summarize_exception_during_detection(
        self,
        mock_client_class
    ):
        """Test summarization when LLM raises exception"""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        
        summary_response = {"message": {"content": "Summary"}}
        mock_client.chat.return_value = summary_response
        
        result = analyze_text_with_local_llm(
            text="Test",
            task="summarize"
        )
        
        # Should still work
        assert "summary" in result
    
    @patch("app.services.local_llm_service.ollama.Client")
    def test_analyze_text_summarize_timeout(
        self,
        mock_client_class
    ):
        """Test summarization timeout handling"""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        
        # Simulate timeout exception
        mock_client.chat.side_effect = TimeoutError("Request timeout")
        
        result = analyze_text_with_local_llm(
            text="Test text",
            task="summarize"
        )
        
        # Should return error message
        assert "summary" in result
        assert "hata" in result["summary"].lower() or "error" in result["summary"].lower()
