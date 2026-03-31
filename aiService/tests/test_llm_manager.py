"""
Unit tests for llm_manager.py service
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException

from app.services.llm_manager import (
    summarize_text,
    chat_over_pdf,
    general_chat,
    _build_chat_prompt
)


# ==========================================
# SUMMARIZE TEXT TESTS
# ==========================================

class TestSummarizeText:
    """Test summarize_text function"""
    
    @patch("app.services.llm_manager.ai_service.gemini_generate")
    def test_summarize_text_cloud(self, mock_gemini):
        """Test summarizing text with cloud LLM"""
        mock_gemini.return_value = "Cloud summary"
        
        result = summarize_text(
            text="Test content",
            prompt_instruction="Summarize this",
            llm_provider="cloud",
            mode="flash"
        )
        
        assert result == "Cloud summary"
        mock_gemini.assert_called_once()
    
    @patch("app.services.llm_manager.analyze_text_with_local_llm")
    def test_summarize_text_local(self, mock_local_llm):
        """Test summarizing text with local LLM"""
        mock_local_llm.return_value = {"summary": "Local summary"}
        
        result = summarize_text(
            text="Test content",
            prompt_instruction="Summarize this",
            llm_provider="local"
        )
        
        assert result == "Local summary"
        mock_local_llm.assert_called_once()
    
    @patch("app.services.llm_manager.analyze_text_with_local_llm")
    def test_summarize_text_local_no_summary(self, mock_local_llm):
        """Test local LLM when no summary is returned"""
        mock_local_llm.return_value = {}
        
        result = summarize_text(
            text="Test content",
            prompt_instruction="Summarize this",
            llm_provider="local"
        )
        
        assert result == "Local LLM yanıt üretmedi."
    
    def test_summarize_text_empty(self):
        """Test summarizing empty text"""
        with pytest.raises(HTTPException) as exc_info:
            summarize_text(text="", prompt_instruction="Summarize")
        
        assert exc_info.value.status_code == 400
    
    def test_summarize_text_invalid_provider(self):
        """Test summarizing with invalid provider"""
        with pytest.raises(HTTPException) as exc_info:
            summarize_text(
                text="Test",
                prompt_instruction="Summarize",
                llm_provider="invalid"  # type: ignore
            )
        
        assert exc_info.value.status_code == 400


# ==========================================
# CHAT OVER PDF TESTS
# ==========================================

class TestChatOverPdf:
    """Test chat_over_pdf function"""
    
    @patch("app.services.llm_manager.ai_service.gemini_generate")
    def test_chat_over_pdf_cloud(self, mock_gemini):
        """Test PDF chat with cloud LLM"""
        mock_gemini.return_value = "Cloud chat response"
        
        answer, actions = chat_over_pdf(
            session_text="PDF content",
            filename="test.pdf",
            history_text="Previous conversation",
            user_message="What is this about?",
            llm_provider="cloud",
            mode="pro"
        )
        
        assert answer == "Cloud chat response"
        assert actions == []
        mock_gemini.assert_called_once()
        # Check that prompt was built correctly
        call_args = mock_gemini.call_args
        assert "PDF content" in call_args[1]["text_content"]
        assert "test.pdf" in call_args[1]["text_content"]
    
    @patch("app.services.llm_manager.analyze_text_with_local_llm")
    def test_chat_over_pdf_local(self, mock_local_llm):
        """Test PDF chat with local LLM"""
        mock_local_llm.return_value = {"answer": "Local chat response"}
        
        answer, actions = chat_over_pdf(
            session_text="PDF content",
            filename="test.pdf",
            history_text="Previous conversation",
            user_message="What is this about?",
            llm_provider="local"
        )
        
        assert answer == "Local chat response"
        assert actions == []
        mock_local_llm.assert_called_once()
    
    @patch("app.services.llm_manager.analyze_text_with_local_llm")
    def test_chat_over_pdf_local_no_answer(self, mock_local_llm):
        """Test local LLM when no answer is returned"""
        mock_local_llm.return_value = {}
        
        answer, _ = chat_over_pdf(
            session_text="PDF content",
            filename="test.pdf",
            history_text="",
            user_message="Test",
            llm_provider="local"
        )
        
        assert answer == "Local LLM yanıt üretmedi."
    
    def test_chat_over_pdf_invalid_provider(self):
        """Test PDF chat with invalid provider"""
        with pytest.raises(HTTPException) as exc_info:
            chat_over_pdf(
                session_text="PDF content",
                filename="test.pdf",
                history_text="",
                user_message="Test",
                llm_provider="invalid"  # type: ignore
            )
        
        assert exc_info.value.status_code == 400


# ==========================================
# GENERAL CHAT TESTS
# ==========================================

class TestGeneralChat:
    """Test general_chat function"""
    
    @patch("app.services.llm_manager.ai_service.gemini_generate")
    def test_general_chat_cloud(self, mock_gemini):
        """Test general chat with cloud LLM"""
        mock_gemini.return_value = "General cloud response"
        
        answer, actions = general_chat(
            history_text="Previous messages",
            user_message="Hello",
            llm_provider="cloud",
            mode="flash"
        )
        
        assert answer == "General cloud response"
        assert actions == []
        mock_gemini.assert_called_once()
    
    @patch("app.services.llm_manager.analyze_text_with_local_llm")
    def test_general_chat_local(self, mock_local_llm):
        """Test general chat with local LLM"""
        mock_local_llm.return_value = {"answer": "General local response"}
        
        answer, actions = general_chat(
            history_text="Previous messages",
            user_message="Hello",
            llm_provider="local"
        )
        
        assert answer == "General local response"
        assert actions == []
        mock_local_llm.assert_called_once()
    
    @patch("app.services.llm_manager.analyze_text_with_local_llm")
    def test_general_chat_local_no_answer(self, mock_local_llm):
        """Test local LLM when no answer is returned"""
        mock_local_llm.return_value = {}
        
        answer, _ = general_chat(
            history_text="",
            user_message="Test",
            llm_provider="local"
        )
        
        assert answer == "Local LLM yanıt üretmedi."


# ==========================================
# HELPER FUNCTION TESTS
# ==========================================

class TestBuildChatPrompt:
    """Test _build_chat_prompt helper function"""
    
    def test_build_chat_prompt(self):
        """Test building chat prompt"""
        result = _build_chat_prompt(
            pdf_context="PDF content here",
            filename="test.pdf",
            history_text="Previous: Hello\nAssistant: Hi",
            user_message="What is this?"
        )
        
        assert "PDF content here" in result
        assert "test.pdf" in result
        assert "Previous: Hello" in result
        assert "What is this?" in result
        assert "PDF asistanısın" in result
    
    def test_build_chat_prompt_empty_history(self):
        """Test building prompt with empty history"""
        result = _build_chat_prompt(
            pdf_context="PDF content",
            filename="test.pdf",
            history_text="",
            user_message="Question"
        )
        
        assert "PDF content" in result
        assert "Question" in result
