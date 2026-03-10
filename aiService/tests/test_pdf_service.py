"""
Unit tests for pdf_service.py
"""
import pytest
from unittest.mock import patch, MagicMock, mock_open
from fastapi import HTTPException
import io

from app.services.pdf_service import (
    extract_text_from_pdf_bytes,
    extract_text_from_pdf_path
)


# ==========================================
# EXTRACT TEXT FROM PDF BYTES TESTS
# ==========================================

class TestExtractTextFromPdfBytes:
    """Test extract_text_from_pdf_bytes function"""
    
    @patch("app.services.pdf_service.PyPDF2.PdfReader")
    def test_extract_text_success(self, mock_pdf_reader):
        """Test successful text extraction from PDF bytes"""
        # Mock PDF reader
        mock_page1 = MagicMock()
        mock_page1.extract_text.return_value = "Page 1 content"
        
        mock_page2 = MagicMock()
        mock_page2.extract_text.return_value = "Page 2 content"
        
        mock_reader = MagicMock()
        mock_reader.pages = [mock_page1, mock_page2]
        mock_pdf_reader.return_value = mock_reader
        
        pdf_bytes = b"%PDF-1.4 fake pdf content"
        result = extract_text_from_pdf_bytes(pdf_bytes)
        
        assert result == "Page 1 content\nPage 2 content"
        mock_pdf_reader.assert_called_once()
    
    @patch("app.services.pdf_service.PyPDF2.PdfReader")
    def test_extract_text_empty_pages(self, mock_pdf_reader):
        """Test extraction when pages have no text"""
        mock_page = MagicMock()
        mock_page.extract_text.return_value = ""
        
        mock_reader = MagicMock()
        mock_reader.pages = [mock_page]
        mock_pdf_reader.return_value = mock_reader
        
        pdf_bytes = b"%PDF-1.4 fake pdf"
        
        with pytest.raises(HTTPException) as exc_info:
            extract_text_from_pdf_bytes(pdf_bytes)
        
        assert exc_info.value.status_code == 400
        assert "metin çıkarılamadı" in exc_info.value.detail
    
    @patch("app.services.pdf_service.PyPDF2.PdfReader")
    def test_extract_text_pdf_read_error(self, mock_pdf_reader):
        """Test extraction when PDF is corrupted"""
        import PyPDF2.errors
        mock_pdf_reader.side_effect = PyPDF2.errors.PdfReadError("Invalid PDF")
        
        pdf_bytes = b"invalid pdf content"
        
        with pytest.raises(HTTPException) as exc_info:
            extract_text_from_pdf_bytes(pdf_bytes)
        
        assert exc_info.value.status_code == 400
        assert "Geçersiz" in exc_info.value.detail or "bozuk" in exc_info.value.detail
    
    @patch("app.services.pdf_service.PyPDF2.PdfReader")
    def test_extract_text_general_exception(self, mock_pdf_reader):
        """Test extraction when general exception occurs"""
        mock_pdf_reader.side_effect = Exception("Unexpected error")
        
        pdf_bytes = b"%PDF-1.4"
        
        with pytest.raises(HTTPException) as exc_info:
            extract_text_from_pdf_bytes(pdf_bytes)
        
        assert exc_info.value.status_code == 500
        assert "PDF işleme hatası" in exc_info.value.detail
    
    @patch("app.services.pdf_service.PyPDF2.PdfReader")
    def test_extract_text_filters_empty_pages(self, mock_pdf_reader):
        """Test that empty pages are filtered out"""
        mock_page1 = MagicMock()
        mock_page1.extract_text.return_value = "Content"
        
        mock_page2 = MagicMock()
        mock_page2.extract_text.return_value = ""  # Empty page
        
        mock_page3 = MagicMock()
        mock_page3.extract_text.return_value = "More content"
        
        mock_reader = MagicMock()
        mock_reader.pages = [mock_page1, mock_page2, mock_page3]
        mock_pdf_reader.return_value = mock_reader
        
        pdf_bytes = b"%PDF-1.4"
        result = extract_text_from_pdf_bytes(pdf_bytes)
        
        # Should only include non-empty pages
        assert "Content" in result
        assert "More content" in result
        assert result.count("\n") == 1  # Only one separator


# ==========================================
# EXTRACT TEXT FROM PDF PATH TESTS
# ==========================================

class TestExtractTextFromPdfPath:
    """Test extract_text_from_pdf_path function"""
    
    @patch("app.services.pdf_service.PyPDF2.PdfReader")
    @patch("builtins.open", new_callable=mock_open, read_data=b"%PDF-1.4 fake pdf")
    def test_extract_text_from_path_success(self, mock_file, mock_pdf_reader):
        """Test successful text extraction from file path"""
        mock_page = MagicMock()
        mock_page.extract_text.return_value = "File content"
        
        mock_reader = MagicMock()
        mock_reader.pages = [mock_page]
        mock_pdf_reader.return_value = mock_reader
        
        result = extract_text_from_pdf_path("/path/to/file.pdf")
        
        assert result == "File content"
        mock_file.assert_called_once_with("/path/to/file.pdf", "rb")
        mock_pdf_reader.assert_called_once()
    
    @patch("builtins.open", side_effect=FileNotFoundError("File not found"))
    def test_extract_text_from_path_not_found(self, mock_file):
        """Test extraction when file doesn't exist"""
        with pytest.raises(HTTPException) as exc_info:
            extract_text_from_pdf_path("/nonexistent/file.pdf")
        
        assert exc_info.value.status_code == 404
        assert "bulunamadı" in exc_info.value.detail
    
    @patch("app.services.pdf_service.PyPDF2.PdfReader")
    @patch("builtins.open", new_callable=mock_open, read_data=b"invalid pdf")
    def test_extract_text_from_path_invalid_pdf(self, mock_file, mock_pdf_reader):
        """Test extraction when PDF is invalid"""
        import PyPDF2.errors
        mock_pdf_reader.side_effect = PyPDF2.errors.PdfReadError("Invalid PDF")
        
        with pytest.raises(HTTPException) as exc_info:
            extract_text_from_pdf_path("/path/to/invalid.pdf")
        
        assert exc_info.value.status_code == 400
        assert "Geçersiz" in exc_info.value.detail or "bozuk" in exc_info.value.detail
    
    @patch("app.services.pdf_service.PyPDF2.PdfReader")
    @patch("builtins.open", new_callable=mock_open, read_data=b"%PDF-1.4")
    def test_extract_text_from_path_empty_text(self, mock_file, mock_pdf_reader):
        """Test extraction when PDF has no extractable text"""
        mock_page = MagicMock()
        mock_page.extract_text.return_value = ""
        
        mock_reader = MagicMock()
        mock_reader.pages = [mock_page]
        mock_pdf_reader.return_value = mock_reader
        
        with pytest.raises(HTTPException) as exc_info:
            extract_text_from_pdf_path("/path/to/scanned.pdf")
        
        assert exc_info.value.status_code == 400
        assert "metin çıkarılamadı" in exc_info.value.detail
    
    @patch("builtins.open", side_effect=PermissionError("Permission denied"))
    def test_extract_text_from_path_permission_error(self, mock_file):
        """Test extraction when file access is denied"""
        with pytest.raises(HTTPException) as exc_info:
            extract_text_from_pdf_path("/protected/file.pdf")
        
        assert exc_info.value.status_code == 500
        assert "PDF işleme hatası" in exc_info.value.detail
