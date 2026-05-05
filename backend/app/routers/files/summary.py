"""Summary-related files router facades.

This module re-exports runtime handlers from ``routes_summarize`` and helpers from
``._legacy`` so imports can be redirected without changing API behavior.
"""

from ._legacy import (
    check_summarize_cache,
    check_summarize_cache_by_hash,
    increment_user_usage_task,
    save_summarize_cache_background,
)
from .routes_summarize import (
    get_file_summary,
    listen_summary,
    summarize_file,
    summarize_for_guest,
    trigger_summarize_task,
)

__all__ = [
    "check_summarize_cache",
    "check_summarize_cache_by_hash",
    "get_file_summary",
    "increment_user_usage_task",
    "listen_summary",
    "save_summarize_cache_background",
    "summarize_file",
    "summarize_for_guest",
    "trigger_summarize_task",
]
