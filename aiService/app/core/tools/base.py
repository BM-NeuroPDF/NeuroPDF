"""Provider-agnostic tool base classes and registry."""
from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolRunResult:
    """Tool output for the LLM plus optional UI actions (not shown to the model as structured JSON)."""

    message: str
    client_actions: list[dict[str, Any]] = field(default_factory=list)


class BaseTool(ABC):
    """Single callable tool with JSON-schema-like parameters description."""

    name: str
    description: str
    parameters_schema: dict[str, Any]

    @abstractmethod
    def execute(self, **kwargs: Any) -> str | ToolRunResult:
        """
        Run the tool. Return a plain str for the LLM, or ToolRunResult to attach client_actions.
        The dispatcher injects _tool_context (dict) for server-side ids; the LLM must not send it.
        """
        raise NotImplementedError


class ToolRegistry:
    """Register and resolve tools by name."""

    def __init__(self) -> None:
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Tool already registered: {tool.name}")
        self._tools[tool.name] = tool

    def get(self, name: str) -> BaseTool | None:
        return self._tools.get(name)

    def all_tools(self) -> list[BaseTool]:
        return list(self._tools.values())

    def schemas_for_prompt(self) -> str:
        """Compact JSON list for system prompt injection."""
        payload = []
        for t in self.all_tools():
            payload.append(
                {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters_schema,
                }
            )
        return json.dumps(payload, ensure_ascii=False, indent=2)
