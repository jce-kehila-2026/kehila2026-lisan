"""Protected ai-service endpoints must reject callers without the internal secret."""
from __future__ import annotations

import os
from unittest import mock

import pytest
from fastapi.testclient import TestClient

PROTECTED_CALLS = [
    (
        "/api/ai/pronunciation/assess",
        {"files": {"audio": ("a.wav", b"RIFF0000", "audio/wav")}, "data": {"reference_text": "שלום"}},
    ),
    ("/api/ai/pronunciation/validate", {"data": {"word": "שלום"}}),
    ("/api/ai/evaluate-speaking", {"json": {"recognizedTextHe": "שלום", "level": "A1"}}),
]


@pytest.fixture
def client():
    from main import app

    return TestClient(app)


@pytest.mark.parametrize(("path", "kwargs"), PROTECTED_CALLS)
def test_missing_secret_is_rejected_with_401(client, path, kwargs):
    with mock.patch.dict(os.environ, {"AI_SERVICE_INTERNAL_SECRET": "internal-secret"}):
        resp = client.post(path, **kwargs)
    assert resp.status_code == 401, resp.text


@pytest.mark.parametrize(("path", "kwargs"), PROTECTED_CALLS)
def test_wrong_secret_is_rejected(client, path, kwargs):
    with mock.patch.dict(os.environ, {"AI_SERVICE_INTERNAL_SECRET": "internal-secret"}):
        resp = client.post(path, headers={"X-Internal-Service-Secret": "nope"}, **kwargs)
    assert resp.status_code == 403, resp.text


@pytest.mark.parametrize(("path", "kwargs"), PROTECTED_CALLS)
def test_production_without_configured_secret_fails_closed(client, path, kwargs):
    with mock.patch.dict(
        os.environ, {"AI_SERVICE_INTERNAL_SECRET": "", "ENV_MODE": "production"}
    ):
        resp = client.post(path, **kwargs)
    assert resp.status_code == 401, resp.text


def test_validate_with_correct_secret_passes(client):
    with mock.patch.dict(os.environ, {"AI_SERVICE_INTERNAL_SECRET": "internal-secret"}):
        resp = client.post(
            "/api/ai/pronunciation/validate",
            data={"word": "שלום"},
            headers={"X-Internal-Service-Secret": "internal-secret"},
        )
    assert resp.status_code == 200, resp.text


def test_helper_fails_closed_in_production():
    from fastapi import HTTPException

    from services.internal_auth import require_internal_service_secret

    with mock.patch.dict(
        os.environ, {"AI_SERVICE_INTERNAL_SECRET": "", "ENV_MODE": "production"}
    ):
        with pytest.raises(HTTPException) as exc:
            require_internal_service_secret(None)
    assert exc.value.status_code == 401

    with mock.patch.dict(
        os.environ, {"AI_SERVICE_INTERNAL_SECRET": "", "ENV_MODE": "development"}
    ):
        assert require_internal_service_secret(None) is None
