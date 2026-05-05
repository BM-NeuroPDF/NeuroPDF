# ai_service/app/services/pdf_service.py

import io
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from fastapi import HTTPException

def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """
    Bir PDF dosyasının ham baytlarını (in-memory) alır ve metnini çıkarır.
    Misafir kullanıcıların senkron istekleri için kullanılır.
    """
    try:
        # Bayt verisini bellekte bir dosya gibi aç
        pdf_file = io.BytesIO(pdf_bytes)
        
        # pypdf ile oku
        reader = PdfReader(pdf_file)
        if reader.is_encrypted and reader.decrypt("") == 0:
            raise HTTPException(
                status_code=400,
                detail="Şifreli PDF desteklenmiyor veya parola gerekli.",
            )
        
        text_parts = []
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                text_parts.append(extracted)
        
        full_text = "\n".join(text_parts)
        
        if not full_text.strip():
            # Bu durum genellikle taranmış (scanned) PDF'lerde olur
            raise HTTPException(
                status_code=400, 
                detail="PDF'ten metin çıkarılamadı. Dosya taranmış bir resim olabilir."
            )
            
        return full_text

    except PdfReadError:
        raise HTTPException(status_code=400, detail="Geçersiz veya bozuk PDF dosyası.")
    except HTTPException:
        # Re-raise HTTPException as-is (don't wrap it)
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF işleme hatası: {str(e)}")


def extract_text_from_pdf_path(storage_path: str) -> str:
    """
    Paylaşılan volume'deki bir PDF dosyasının yolunu alır ve metnini çıkarır.
    Kayıtlı kullanıcıların asenkron Celery görevleri için kullanılır.
    """
    try:
        # Dosyayı paylaşılan diskten (shared_uploads) aç
        with open(storage_path, "rb") as pdf_file:
            
            # pypdf ile oku
            reader = PdfReader(pdf_file)
            if reader.is_encrypted and reader.decrypt("") == 0:
                raise HTTPException(
                    status_code=400,
                    detail="Şifreli PDF desteklenmiyor veya parola gerekli.",
                )
            
            text_parts = []
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text_parts.append(extracted)
            
            full_text = "\n".join(text_parts)

            if not full_text.strip():
                raise HTTPException(
                    status_code=400, 
                    detail="PDF'ten metin çıkarılamadı (taranmış resim)."
                )
                
            return full_text

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Dosya bulunamadı: {storage_path}")
    except PdfReadError:
        raise HTTPException(status_code=400, detail="Geçersiz veya bozuk PDF dosyası.")
    except HTTPException:
        # Re-raise HTTPException as-is (don't wrap it)
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF işleme hatası: {str(e)}")