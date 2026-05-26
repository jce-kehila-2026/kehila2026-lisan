from __future__ import annotations

from fastapi.testclient import TestClient

from main import app
from services.chat_cache import reset_rate_limit

client = TestClient(app)


def _headers(user_id: str) -> dict[str, str]:
    return {"X-User-ID": user_id}


def test_eleventh_request_is_rate_limited():
    reset_rate_limit("test-user")

    for _ in range(10):
        response = client.get("/api/ai/cache/stats", headers=_headers("test-user"))
        assert response.status_code == 200

    blocked = client.get("/api/ai/cache/stats", headers=_headers("test-user"))
    assert blocked.status_code == 429
    assert blocked.json()["detail"] == "Rate limit exceeded"
    assert int(blocked.headers["Retry-After"]) >= 1


def test_different_users_have_independent_limits():
    reset_rate_limit("user-a")
    reset_rate_limit("user-b")

    for _ in range(10):
        response = client.get("/api/ai/cache/stats", headers=_headers("user-a"))
        assert response.status_code == 200

    blocked = client.get("/api/ai/cache/stats", headers=_headers("user-a"))
    allowed_other_user = client.get("/api/ai/cache/stats", headers=_headers("user-b"))

    assert blocked.status_code == 429
    assert allowed_other_user.status_code == 200


def test_rate_limit_status_endpoint_reports_usage_without_consuming_budget():
    reset_rate_limit("status-user")

    for _ in range(3):
        response = client.get("/api/ai/cache/stats", headers=_headers("status-user"))
        assert response.status_code == 200

    status = client.get("/api/ai/rate-limit/status", params={"user_id": "status-user"})
    assert status.status_code == 200
    body = status.json()
    assert body["userId"] == "status-user"
    assert body["requestsInWindow"] == 3
    assert body["remainingRequests"] == 7
    assert body["allowed"] is True
