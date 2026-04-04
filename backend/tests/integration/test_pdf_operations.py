"""
Integration tests for PDF operations.
"""

import pytest
import uuid
from app.models import PDF, User
from app.storage import (
    save_pdf_to_db,
    get_pdf_from_db,
    delete_pdf_from_db,
    list_user_pdfs,
)


@pytest.mark.integration
class TestPDFOperations:
    """Test PDF CRUD operations."""

    def test_save_pdf_to_db(self, db_session, clean_db, test_user):
        """Test saving PDF to database."""
        pdf_bytes = b"fake_pdf_content"
        filename = "test_document.pdf"

        pdf = save_pdf_to_db(db_session, test_user.id, pdf_bytes, filename)

        assert pdf is not None
        assert pdf.user_id == test_user.id
        assert pdf.filename == filename
        assert pdf.pdf_data == pdf_bytes
        assert pdf.file_size == len(pdf_bytes)

    def test_get_pdf_from_db(self, db_session, clean_db, test_user):
        """Test retrieving PDF from database."""
        pdf_bytes = b"retrieve_test_content"
        pdf = PDF(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            pdf_data=pdf_bytes,
            filename="retrieve_test.pdf",
            file_size=len(pdf_bytes),
        )
        db_session.add(pdf)
        db_session.commit()

        retrieved = get_pdf_from_db(db_session, pdf.id, test_user.id)

        assert retrieved is not None
        assert retrieved.id == pdf.id
        assert retrieved.pdf_data == pdf_bytes

    def test_get_pdf_wrong_user(self, db_session, clean_db, test_user):
        """Test that user cannot access other user's PDF."""
        other_user_id = str(uuid.uuid4())
        other_user = User(
            id=other_user_id, username="otheruser", llm_choice_id=0, role_id=0
        )
        db_session.add(other_user)
        db_session.commit()

        pdf_bytes = b"private_content"
        pdf = PDF(
            id=str(uuid.uuid4()),
            user_id=other_user_id,
            pdf_data=pdf_bytes,
            filename="private.pdf",
            file_size=len(pdf_bytes),
        )
        db_session.add(pdf)
        db_session.commit()

        # Try to get PDF with wrong user_id
        retrieved = get_pdf_from_db(db_session, pdf.id, test_user.id)

        assert retrieved is None

    def test_delete_pdf_from_db(self, db_session, clean_db, test_user):
        """Test deleting PDF from database."""
        pdf_bytes = b"delete_test_content"
        pdf = PDF(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            pdf_data=pdf_bytes,
            filename="delete_test.pdf",
            file_size=len(pdf_bytes),
        )
        db_session.add(pdf)
        db_session.commit()

        result = delete_pdf_from_db(db_session, pdf.id, test_user.id)

        assert result is True
        assert get_pdf_from_db(db_session, pdf.id) is None

    def test_list_user_pdfs(self, db_session, clean_db, test_user):
        """Test listing user's PDFs."""
        # Create multiple PDFs
        for i in range(3):
            pdf = PDF(
                id=str(uuid.uuid4()),
                user_id=test_user.id,
                pdf_data=b"content",
                filename=f"test_{i}.pdf",
                file_size=100,
            )
            db_session.add(pdf)
        db_session.commit()

        pdfs = list_user_pdfs(db_session, test_user.id)

        assert len(pdfs) == 3
        assert all(pdf.user_id == test_user.id for pdf in pdfs)

    def test_pdf_cascade_delete_with_user(self, db_session, clean_db, test_user):
        """Test PDF cascade delete when user is deleted."""
        pdf_bytes = b"cascade_test"
        pdf = PDF(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            pdf_data=pdf_bytes,
            filename="cascade_test.pdf",
            file_size=len(pdf_bytes),
        )
        db_session.add(pdf)
        db_session.commit()

        db_session.delete(test_user)
        db_session.commit()

        assert get_pdf_from_db(db_session, pdf.id) is None
