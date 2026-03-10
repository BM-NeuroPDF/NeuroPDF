"""
Unit tests for tts_manager.py
"""
import pytest
from unittest.mock import patch, MagicMock
import io

from app.services.tts_manager import text_to_speech


# ==========================================
# TEXT TO SPEECH TESTS
# ==========================================

class TestTextToSpeech:
    """Test text_to_speech function"""
    
    @patch("app.services.tts_manager.requests.post")
    @patch("app.services.tts_manager.os.getenv")
    def test_text_to_speech_success(self, mock_getenv, mock_post):
        """Test successful text-to-speech conversion"""
        # Mock API key
        mock_getenv.return_value = "test-api-key"
        
        # Mock successful response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"fake_audio_data"
        mock_post.return_value = mock_response
        
        result = text_to_speech("Test text")
        
        assert result is not None
        assert isinstance(result, io.BytesIO)
        assert result.read() == b"fake_audio_data"
        
        # Verify API call
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert "elevenlabs.io" in call_args[0][0]
        assert call_args[1]["json"]["text"] == "Test text"
        assert call_args[1]["json"]["model_id"] == "eleven_multilingual_v2"
    
    @patch("app.services.tts_manager.os.getenv")
    def test_text_to_speech_no_api_key(self, mock_getenv):
        """Test TTS when API key is missing"""
        mock_getenv.return_value = None
        
        result = text_to_speech("Test text")
        
        assert result is None
    
    @patch("app.services.tts_manager.requests.post")
    @patch("app.services.tts_manager.os.getenv")
    def test_text_to_speech_api_error(self, mock_getenv, mock_post):
        """Test TTS when API returns error"""
        mock_getenv.return_value = "test-api-key"
        
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"
        mock_post.return_value = mock_response
        
        result = text_to_speech("Test text")
        
        assert result is None
    
    @patch("app.services.tts_manager.requests.post")
    @patch("app.services.tts_manager.os.getenv")
    def test_text_to_speech_network_error(self, mock_getenv, mock_post):
        """Test TTS when network error occurs"""
        mock_getenv.return_value = "test-api-key"
        mock_post.side_effect = Exception("Network error")
        
        result = text_to_speech("Test text")
        
        assert result is None
    
    @patch("app.services.tts_manager.requests.post")
    @patch("app.services.tts_manager.os.getenv")
    def test_text_to_speech_voice_settings(self, mock_getenv, mock_post):
        """Test that voice settings are correctly passed"""
        mock_getenv.return_value = "test-api-key"
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"audio"
        mock_post.return_value = mock_response
        
        text_to_speech("Test")
        
        call_args = mock_post.call_args
        voice_settings = call_args[1]["json"]["voice_settings"]
        
        assert "stability" in voice_settings
        assert "similarity_boost" in voice_settings
        assert voice_settings["stability"] == 0.5
        assert voice_settings["similarity_boost"] == 0.75
    
    @patch("app.services.tts_manager.requests.post")
    @patch("app.services.tts_manager.os.getenv")
    def test_text_to_speech_headers(self, mock_getenv, mock_post):
        """Test that correct headers are sent"""
        mock_getenv.return_value = "test-api-key"
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"audio"
        mock_post.return_value = mock_response
        
        text_to_speech("Test")
        
        call_args = mock_post.call_args
        headers = call_args[1]["headers"]
        
        assert headers["Accept"] == "audio/mpeg"
        assert headers["Content-Type"] == "application/json"
        assert headers["xi-api-key"] == "test-api-key"
    
    @patch("app.services.tts_manager.requests.post")
    @patch("app.services.tts_manager.os.getenv")
    def test_text_to_speech_returns_bytesio(self, mock_getenv, mock_post):
        """Test that function returns BytesIO object"""
        mock_getenv.return_value = "test-api-key"
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"audio_data_12345"
        mock_post.return_value = mock_response
        
        result = text_to_speech("Test text")
        
        assert isinstance(result, io.BytesIO)
        result.seek(0)
        assert result.read() == b"audio_data_12345"
