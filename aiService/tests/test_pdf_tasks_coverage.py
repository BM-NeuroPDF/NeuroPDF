from unittest.mock import MagicMock, patch

import pytest


@patch("app.tasks.pdf_tasks.summarize_text", return_value="özet")
@patch(
    "app.tasks.pdf_tasks.pdf_service.extract_text_from_pdf_path",
    return_value="pdf metin",
)
@patch("app.tasks.pdf_tasks.httpx.Client")
def test_async_summarize_success(mock_client_cls, *_):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = None
    mock_client.post.return_value = mock_resp
    mock_client_cls.return_value = mock_client

    from app.tasks.pdf_tasks import async_summarize_pdf

    r = async_summarize_pdf.run(
        pdf_id=1,
        storage_path="/tmp/x.pdf",
        callback_url="http://cb/ok",
        llm_provider="cloud",
        mode="pro",
    )
    assert r["status"] == "success"
    assert r["summary_length"] == len("özet")


@patch("app.tasks.pdf_tasks.summarize_text", return_value="local özet")
@patch("app.tasks.pdf_tasks.pdf_service.extract_text_from_pdf_path", return_value="t")
@patch("app.tasks.pdf_tasks.httpx.Client")
def test_async_summarize_local_prompt_branch(mock_client_cls, *_):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = None
    mock_client.post.return_value = mock_resp
    mock_client_cls.return_value = mock_client

    from app.tasks.pdf_tasks import async_summarize_pdf

    async_summarize_pdf.run(
        pdf_id=2,
        storage_path="/a.pdf",
        callback_url="http://cb/",
        llm_provider="local",
        mode="flash",
    )


@patch("app.tasks.pdf_tasks.summarize_text", side_effect=RuntimeError("LLM fail"))
@patch("app.tasks.pdf_tasks.pdf_service.extract_text_from_pdf_path", return_value="t")
@patch("app.tasks.pdf_tasks.httpx.Client")
def test_async_summarize_error_posts_and_reraises(mock_client_cls, *_):
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = None
    mock_client.post.return_value = MagicMock()
    mock_client_cls.return_value = mock_client

    from app.tasks.pdf_tasks import async_summarize_pdf

    with pytest.raises(RuntimeError):
        async_summarize_pdf.run(
            pdf_id=3,
            storage_path="/b.pdf",
            callback_url="http://cb/err",
            llm_provider="cloud",
        )
    assert mock_client.post.call_count >= 1


@patch("app.tasks.pdf_tasks.summarize_text", side_effect=ValueError("x"))
@patch("app.tasks.pdf_tasks.pdf_service.extract_text_from_pdf_path", return_value="t")
@patch("app.tasks.pdf_tasks.httpx.Client")
def test_async_summarize_error_callback_fails_silent(mock_client_cls, *_):
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = None
    mock_client.post.side_effect = ConnectionError("no network")
    mock_client_cls.return_value = mock_client

    from app.tasks.pdf_tasks import async_summarize_pdf

    with pytest.raises(ValueError):
        async_summarize_pdf.run(
            pdf_id=4,
            storage_path="/c.pdf",
            callback_url="http://cb/",
        )
