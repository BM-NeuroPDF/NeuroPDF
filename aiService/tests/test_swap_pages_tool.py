"""Tests for swap_pages tool (client-side signal)."""
from app.core.tools.swap_pages_tool import SwapPagesTool


def test_swap_pages_emits_client_action():
    tool = SwapPagesTool()
    out = tool.execute(page_a=2, page_b=3)
    assert hasattr(out, "client_actions")
    assert len(out.client_actions) == 1
    assert out.client_actions[0]["type"] == "SWAP_PAGES_LOCAL"
    assert out.client_actions[0]["payload"] == {"page_a": 2, "page_b": 3}


def test_swap_same_page_returns_error_string():
    tool = SwapPagesTool()
    err = tool.execute(page_a=1, page_b=1)
    assert isinstance(err, str)
    assert "Aynı sayfa" in err or "aynı" in err.lower()
