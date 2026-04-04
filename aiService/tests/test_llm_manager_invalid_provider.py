import pytest
from fastapi import HTTPException

from app.services.llm_manager import summarize_text, chat_over_pdf, general_chat


def test_summarize_invalid_provider():
    with pytest.raises(HTTPException) as e:
        summarize_text("a", "b", llm_provider="bogus")  # type: ignore[arg-type]
    assert e.value.status_code == 400


def test_chat_over_pdf_invalid_provider():
    with pytest.raises(HTTPException) as e:
        chat_over_pdf("t", "f.pdf", "", "hi", llm_provider="bogus")  # type: ignore[arg-type]
    assert e.value.status_code == 400


def test_general_chat_invalid_provider():
    with pytest.raises(HTTPException) as e:
        general_chat("", "hi", llm_provider="bogus")  # type: ignore[arg-type]
    assert e.value.status_code == 400
