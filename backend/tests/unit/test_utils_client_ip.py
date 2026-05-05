"""Tests for X-Forwarded-For / direct client IP resolution."""

from __future__ import annotations

from unittest.mock import Mock, patch

import pytest
from fastapi import Request

from app.utils import client_ip as client_ip_module


@pytest.mark.unit
class TestGetClientIp:
    def test_uses_socket_client_when_no_trusted_proxy(self):
        req = Mock(spec=Request)
        req.headers = {}
        c = Mock()
        c.host = "198.51.100.10"
        req.client = c
        with patch.object(client_ip_module.settings, "TRUSTED_PROXY_HOPS", 0):
            assert client_ip_module.get_client_ip(req) == "198.51.100.10"

    def test_trusted_proxy_prefers_x_forwarded_for_leftmost(self):
        req = Mock(spec=Request)
        req.headers = {"x-forwarded-for": "203.0.113.1, 10.0.0.2"}
        req.client = Mock()
        req.client.host = "10.0.0.2"
        with patch.object(client_ip_module.settings, "TRUSTED_PROXY_HOPS", 1):
            assert client_ip_module.get_client_ip(req) == "203.0.113.1"

    def test_trusted_proxy_falls_back_to_x_real_ip(self):
        req = Mock(spec=Request)
        req.headers = {"x-real-ip": " 198.18.0.1 "}
        req.client = Mock()
        req.client.host = "10.0.0.1"
        with patch.object(client_ip_module.settings, "TRUSTED_PROXY_HOPS", 1):
            assert client_ip_module.get_client_ip(req) == "198.18.0.1"

    def test_unknown_when_no_client(self):
        req = Mock(spec=Request)
        req.headers = {}
        req.client = None
        with patch.object(client_ip_module.settings, "TRUSTED_PROXY_HOPS", 0):
            assert client_ip_module.get_client_ip(req) == "unknown"
