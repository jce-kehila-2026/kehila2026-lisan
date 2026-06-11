from __future__ import annotations

import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from services.language_profile import LanguageProfile

logger = logging.getLogger("lisan.chat.trace")

_LANGFUSE_CLIENT = None
_LANGFUSE_INITIALIZED = False


def get_langfuse_client():
    global _LANGFUSE_CLIENT, _LANGFUSE_INITIALIZED
    if os.getenv("ENABLE_LANGFUSE", "").strip().lower() not in {"1", "true", "yes", "on"}:
        return None
    if _LANGFUSE_INITIALIZED:
        return _LANGFUSE_CLIENT
        
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "").strip()
    secret_key = os.getenv("LANGFUSE_SECRET_KEY", "").strip()
    host = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com").strip()
    
    if public_key and secret_key:
        try:
            from langfuse import Langfuse
            _LANGFUSE_CLIENT = Langfuse(public_key=public_key, secret_key=secret_key, host=host)
            logger.info("Langfuse initialized successfully")
        except Exception as exc:
            logger.warning(f"Failed to initialize Langfuse: {exc}")
            
    _LANGFUSE_INITIALIZED = True
    return _LANGFUSE_CLIENT


@dataclass
class ChatTrace:
    trace_id: str
    started_at: float
    level: str
    session_id: str | None
    language_profile: LanguageProfile
    stages: list[dict[str, Any]] = field(default_factory=list)
    llm_called: bool = False

    def __post_init__(self):
        client = get_langfuse_client()
        self.lf_trace = None
        if client:
            try:
                self.lf_trace = client.trace(
                    id=self.trace_id,
                    name="chat_engine",
                    session_id=self.session_id,
                    metadata={"level": self.level, "language_profile": self.language_profile.as_log_dict()}
                )
            except Exception:
                pass

    @classmethod
    def start(
        cls,
        *,
        level: str,
        session_id: str | None,
        language_profile: LanguageProfile,
    ) -> "ChatTrace":
        return cls(
            trace_id=uuid.uuid4().hex[:16],
            started_at=time.perf_counter(),
            level=level,
            session_id=session_id,
            language_profile=language_profile,
        )

    def add(self, stage: str, **fields: Any) -> None:
        payload = {
            "stage": stage,
            "elapsedMs": int((time.perf_counter() - self.started_at) * 1000),
        }
        payload.update({key: value for key, value in fields.items() if value is not None})
        self.stages.append(payload)
        if stage == "llm_call":
            self.llm_called = True
            
        if self.lf_trace:
            try:
                self.lf_trace.event(
                    name=stage,
                    input=fields,
                )
            except Exception:
                pass

    def finish(
        self,
        *,
        outcome: str,
        fallback_reason: str | None = None,
        router_hit: bool = False,
        cache_hit: bool = False,
    ) -> None:
        if self.lf_trace:
            try:
                self.lf_trace.update(
                    output={
                        "outcome": outcome,
                        "fallback_reason": fallback_reason,
                        "router_hit": router_hit,
                        "cache_hit": cache_hit,
                    }
                )
            except Exception:
                pass
                
        if not _debug_enabled():
            return
        logger.info(
            json.dumps(
                {
                    "event": "chat_trace",
                    "traceId": self.trace_id,
                    "level": self.level,
                    "sessionId": self.session_id,
                    "languageProfile": self.language_profile.as_log_dict(),
                    "llmCalled": self.llm_called,
                    "outcome": outcome,
                    "fallbackReason": fallback_reason,
                    "routerHit": router_hit,
                    "cacheHit": cache_hit,
                    "latencyMs": int((time.perf_counter() - self.started_at) * 1000),
                    "stages": self.stages,
                },
                ensure_ascii=False,
            )
        )


def _debug_enabled() -> bool:
    return os.getenv("CHAT_DEBUG_TRACE", "").strip().lower() in {"1", "true", "yes", "on"}
