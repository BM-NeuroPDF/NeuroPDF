"""Tests for ToolRegistry and BaseTool registration."""
import pytest

from app.core.tools.base import BaseTool, ToolRegistry


class _DummyTool(BaseTool):
    name = "dummy"
    description = "test"
    parameters_schema = {"type": "object", "properties": {}}

    def execute(self, **kwargs):
        return "ok"


def test_register_get_all_schemas():
    reg = ToolRegistry()
    t = _DummyTool()
    reg.register(t)
    assert reg.get("dummy") is t
    assert reg.all_tools() == [t]
    s = reg.schemas_for_prompt()
    assert "dummy" in s
    assert "test" in s
    assert "parameters" in s


def test_duplicate_register_raises():
    reg = ToolRegistry()
    reg.register(_DummyTool())
    with pytest.raises(ValueError, match="already registered"):
        reg.register(_DummyTool())


def test_get_unknown_returns_none():
    reg = ToolRegistry()
    assert reg.get("nope") is None
