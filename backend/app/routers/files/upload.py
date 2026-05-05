"""Upload/storage-related files router facades."""

from .routes_pdf_tools import (
    delete_file,
    download_stored_pdf,
    get_my_files,
    save_processed_pdf,
    upload_pdf,
)

__all__ = [
    "delete_file",
    "download_stored_pdf",
    "get_my_files",
    "save_processed_pdf",
    "upload_pdf",
]
