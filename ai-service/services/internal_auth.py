"""
Shared guard for endpoints that only the Lisan backend may call.

The backend sends ``X-Internal-Service-Secret`` with every request to the
ai-service (see backend/src/services/aiChatService.js). The value must match
``AI_SERVICE_INTERNAL_SECRET``.

When the secret is not configured:
- ENV_MODE=production -> reject every request (fail closed).
- any other mode      -> allow (local development and tests).
"""

from __future__ import annotations

import hmac
import os

from fastapi import Header, HTTPException


def _is_production() -> bool:
    return os.getenv("ENV_MODE", "development").strip().lower() == "production"


def require_internal_service_secret(
    x_internal_service_secret: str | None = Header(default=None),
) -> None:
    expected_secret = os.getenv("AI_SERVICE_INTERNAL_SECRET", "").strip()

    if not expected_secret:
        if _is_production():
            raise HTTPException(
                status_code=401,
                detail="Internal service secret is not configured",
            )
        return None

    if not x_internal_service_secret:
        raise HTTPException(
            status_code=401,
            detail="Missing internal service secret",
        )

    if not hmac.compare_digest(
        x_internal_service_secret.encode("utf-8"), expected_secret.encode("utf-8")
    ):
        raise HTTPException(
            status_code=403,
            detail="Invalid internal service secret",
        )

    return None
