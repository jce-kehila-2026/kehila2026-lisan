import io
from unittest.mock import patch

from services import backend_keep_warm as kw


class _Resp(io.BytesIO):
    status = 200
    def __enter__(self): return self
    def __exit__(self, *a): return False


def test_disabled_outside_production(monkeypatch):
    monkeypatch.delenv("KEEP_WARM_BACKEND", raising=False)
    monkeypatch.setenv("ENV_MODE", "development")
    assert kw._enabled() is False


def test_enabled_by_default_in_production(monkeypatch):
    monkeypatch.delenv("KEEP_WARM_BACKEND", raising=False)
    monkeypatch.setenv("ENV_MODE", "production")
    assert kw._enabled() is True


def test_explicit_flag_wins(monkeypatch):
    monkeypatch.setenv("ENV_MODE", "production")
    monkeypatch.setenv("KEEP_WARM_BACKEND", "false")
    assert kw._enabled() is False


def test_ping_hits_ready_on_backend(monkeypatch):
    monkeypatch.setenv("BACKEND_URL", "lisan-backend:10000")
    monkeypatch.delenv("KEEP_WARM_PATH", raising=False)
    seen = {}
    def fake_open(req, timeout):
        seen["url"] = req.full_url
        return _Resp(b"{}")
    with patch.object(kw.urllib.request, "urlopen", fake_open):
        assert kw.ping_once() is True
    assert seen["url"] == "http://lisan-backend:10000/api/ready"


def test_ping_never_raises(monkeypatch):
    monkeypatch.setenv("BACKEND_URL", "https://example.invalid")
    def boom(*a, **k): raise OSError("down")
    with patch.object(kw.urllib.request, "urlopen", boom):
        assert kw.ping_once() is False


def test_no_backend_url_does_not_start(monkeypatch):
    monkeypatch.setenv("KEEP_WARM_BACKEND", "true")
    monkeypatch.delenv("BACKEND_URL", raising=False)
    monkeypatch.delenv("RAG_BACKEND_URL", raising=False)
    assert kw.start() is False


def test_interval_has_a_floor(monkeypatch):
    monkeypatch.setenv("KEEP_WARM_INTERVAL_SECONDS", "5")
    assert kw._interval() == 60.0
