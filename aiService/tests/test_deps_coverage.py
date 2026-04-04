import os
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.deps import verify_api_key


def test_verify_dev_bypass_empty_key():
    with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
        with patch("app.deps.settings") as s:
            s.AI_SERVICE_API_KEY = ""
            assert verify_api_key(x_api_key=None) is True


def test_verify_production_missing_key():
    with patch.dict(os.environ, {"ENVIRONMENT": "production"}, clear=False):
        with patch("app.deps.settings") as s:
            s.AI_SERVICE_API_KEY = "secret"
            with pytest.raises(HTTPException) as e:
                verify_api_key(x_api_key=None)
            assert e.value.status_code == 401


def test_verify_production_invalid_key():
    with patch.dict(os.environ, {"ENVIRONMENT": "production"}, clear=False):
        with patch("app.deps.settings") as s:
            s.AI_SERVICE_API_KEY = "secret"
            with pytest.raises(HTTPException) as e:
                verify_api_key(x_api_key="wrong")
            assert e.value.status_code == 403


def test_verify_production_ok():
    with patch.dict(os.environ, {"ENVIRONMENT": "production"}, clear=False):
        with patch("app.deps.settings") as s:
            s.AI_SERVICE_API_KEY = "good"
            assert verify_api_key(x_api_key="good") is True


def test_logging_failure_does_not_block_401():
    with patch.dict(os.environ, {"ENVIRONMENT": "production"}, clear=False):
        with patch("app.deps.settings") as s:
            s.AI_SERVICE_API_KEY = "secret"
            with patch("logging.getLogger") as gl:
                gl.return_value.warning.side_effect = RuntimeError("log fail")
                with pytest.raises(HTTPException) as e:
                    verify_api_key(x_api_key=None)
                assert e.value.status_code == 401


def test_logging_failure_does_not_block_403():
    with patch.dict(os.environ, {"ENVIRONMENT": "production"}, clear=False):
        with patch("app.deps.settings") as s:
            s.AI_SERVICE_API_KEY = "secret"
            with patch("logging.getLogger") as gl:
                gl.return_value.warning.side_effect = RuntimeError("log fail")
                with pytest.raises(HTTPException) as e:
                    verify_api_key(x_api_key="wrong")
                assert e.value.status_code == 403
