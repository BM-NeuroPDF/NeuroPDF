"""Tool registry and default registration."""
from __future__ import annotations

from .base import BaseTool, ToolRegistry, ToolRunResult
from .extract_tool import ExtractPagesTool
from .merge_tool import MergePdfTool
from .clear_tool import ClearPdfsTool
from .summarize_tool import SummarizePdfTool
from .translate_tool import TranslatePdfTool
from .swap_pages_tool import SwapPagesTool

registry = ToolRegistry()


def register_default_tools() -> None:
    """Idempotent enough for tests: skip if already registered."""
    if registry.get("extract_pages") is None:
        registry.register(ExtractPagesTool())
    if registry.get("merge_pdfs") is None:
        registry.register(MergePdfTool())
    if registry.get("clear_pdfs") is None:
        registry.register(ClearPdfsTool())
    if registry.get("summarize_pdf") is None:
        registry.register(SummarizePdfTool())
    if registry.get("translate_pdf") is None:
        registry.register(TranslatePdfTool())
    if registry.get("swap_pages") is None:
        registry.register(SwapPagesTool())


register_default_tools()

__all__ = [
    "BaseTool",
    "ToolRegistry",
    "ToolRunResult",
    "ExtractPagesTool",
    "MergePdfTool",
    "ClearPdfsTool",
    "SummarizePdfTool",
    "TranslatePdfTool",
    "SwapPagesTool",
    "registry",
    "register_default_tools",
]
