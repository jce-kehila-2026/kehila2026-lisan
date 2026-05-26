from __future__ import annotations

import os
import queue
import re
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from dotenv import load_dotenv

from services.chat_circuit_breaker import CircuitBreaker

try:
    from anthropic import Anthropic
except ImportError:
    Anthropic = None

try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:
    genai = None
    genai_types = None

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

DEFAULT_PROVIDER = "gemini"
DEFAULT_MODEL = "gemini-2.5-flash-lite"
DEFAULT_TIMEOUT_SECONDS = 5.0
DEFAULT_HARD_TIMEOUT_SECONDS = 4.5
DEFAULT_MAX_RETRIES = 1
DEFAULT_REQUEST_DELAY_SECONDS = 0.0
DEFAULT_PROVIDER_LOG_LIMIT = 200


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    model: str
    timeout_seconds: float


@dataclass
class ProviderAttemptLog:
    provider: str
    model: str
    status: str
    error_type: str | None = None
    error_message: str | None = None
    latency_ms: int = 0
    timestamp: float = field(default_factory=time.time)


@dataclass
class ProviderFailure:
    provider: str
    model: str
    error: Exception
    status: str = "failed"


@dataclass
class ProviderResult:
    answer: str
    latency_seconds: float
    input_tokens: int
    output_tokens: int
    provider: str
    model: str
    attempts: list[ProviderAttemptLog] = field(default_factory=list)


class ChatProviderError(RuntimeError):
    pass


class ChatProviderTimeoutError(TimeoutError):
    pass


class ChatProviderQuotaError(ChatProviderError):
    """429 / rate-limit / quota exceeded."""


class ChatProviderAuthError(ChatProviderError):
    """Invalid or missing API key."""


class ChatProviderNetworkError(ChatProviderError):
    """Network connectivity failure."""


class AllProvidersFailedError(ChatProviderError):
    def __init__(self, failures: list[ProviderFailure]) -> None:
        self.failures = failures
        summary = ", ".join(
            f"{failure.provider}:{failure.error.__class__.__name__}"
            for failure in failures
        ) or "no provider attempts"
        super().__init__(f"All providers failed: {summary}")

    @property
    def primary_error(self) -> Exception:
        return self.failures[-1].error if self.failures else ChatProviderError("All providers failed")


PROVIDER_CHAIN: list[ProviderConfig] = [
    ProviderConfig(name="gemini", model="gemini-2.5-flash-lite", timeout_seconds=12.0),
    ProviderConfig(name="anthropic", model="claude-3-5-sonnet-20241022", timeout_seconds=15.0),
    ProviderConfig(name="openai", model="gpt-4o-mini", timeout_seconds=15.0),
]

_PROVIDER_CIRCUITS: dict[str, CircuitBreaker] = {
    config.name: CircuitBreaker() for config in PROVIDER_CHAIN
}
_PROVIDER_LOG_LOCK = threading.Lock()
_PROVIDER_LOGS: deque[ProviderAttemptLog] = deque(maxlen=DEFAULT_PROVIDER_LOG_LIMIT)


def get_configured_provider() -> tuple[str, str]:
    provider = os.getenv("LLM_PROVIDER", DEFAULT_PROVIDER).strip().lower() or DEFAULT_PROVIDER
    model = os.getenv("LLM_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    return provider, model


def get_provider_logs(provider: str | None = None, status: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    normalized_provider = (provider or "").strip().lower() or None
    normalized_status = (status or "").strip().lower() or None
    capped_limit = max(1, min(limit, DEFAULT_PROVIDER_LOG_LIMIT))

    with _PROVIDER_LOG_LOCK:
        logs = list(_PROVIDER_LOGS)

    filtered_logs = [
        log
        for log in reversed(logs)
        if (normalized_provider is None or log.provider == normalized_provider)
        and (normalized_status is None or log.status == normalized_status)
    ]
    return [
        {
            "provider": log.provider,
            "model": log.model,
            "status": log.status,
            "errorType": log.error_type,
            "errorMessage": log.error_message,
            "latencyMs": log.latency_ms,
            "timestamp": log.timestamp,
        }
        for log in filtered_logs[:capped_limit]
    ]


def get_provider_circuit(provider: str) -> CircuitBreaker:
    normalized_provider = provider.strip().lower()
    if normalized_provider not in _PROVIDER_CIRCUITS:
        _PROVIDER_CIRCUITS[normalized_provider] = CircuitBreaker()
    return _PROVIDER_CIRCUITS[normalized_provider]


def clear_provider_runtime_state() -> None:
    with _PROVIDER_LOG_LOCK:
        _PROVIDER_LOGS.clear()
    for circuit in _PROVIDER_CIRCUITS.values():
        circuit.reset()


def call_provider(provider: str, model: str, system_message: str, question: str) -> ProviderResult:
    attempts: list[ProviderAttemptLog] = []
    failures: list[ProviderFailure] = []

    for config in _build_provider_chain(provider, model):
        circuit = get_provider_circuit(config.name)
        if not circuit.allow_request():
            attempt = ProviderAttemptLog(
                provider=config.name,
                model=config.model,
                status="skipped",
                error_type="CircuitOpen",
                error_message="Provider circuit is open",
            )
            attempts.append(attempt)
            _append_provider_log(attempt)
            failures.append(
                ProviderFailure(
                    provider=config.name,
                    model=config.model,
                    error=ChatProviderTimeoutError("Provider circuit is open"),
                    status="skipped",
                )
            )
            continue

        try:
            result = _call_provider_with_timeout(config, system_message, question)
            circuit.record_success()
            success_attempt = ProviderAttemptLog(
                provider=config.name,
                model=config.model,
                status="success",
                latency_ms=int(round(result.latency_seconds * 1000)),
            )
            attempts.append(success_attempt)
            _append_provider_log(success_attempt)
            result.provider = config.name
            result.model = config.model
            result.attempts = attempts
            return result
        except Exception as raw_exc:
            exc = _coerce_provider_exception(raw_exc)
            circuit.record_failure()
            failed_attempt = ProviderAttemptLog(
                provider=config.name,
                model=config.model,
                status="failed",
                error_type=exc.__class__.__name__,
                error_message=str(exc),
            )
            attempts.append(failed_attempt)
            _append_provider_log(failed_attempt)
            failures.append(
                ProviderFailure(
                    provider=config.name,
                    model=config.model,
                    error=exc,
                )
            )

    raise AllProvidersFailedError(failures)


def _build_provider_chain(provider: str, model: str) -> list[ProviderConfig]:
    requested_provider = (provider or DEFAULT_PROVIDER).strip().lower() or DEFAULT_PROVIDER
    requested_model = (model or DEFAULT_MODEL).strip() or DEFAULT_MODEL

    chain: list[ProviderConfig] = []
    seen_providers: set[str] = set()

    for base_config in PROVIDER_CHAIN:
        if base_config.name == requested_provider:
            chain.append(
                ProviderConfig(
                    name=base_config.name,
                    model=requested_model,
                    timeout_seconds=base_config.timeout_seconds,
                )
            )
            seen_providers.add(base_config.name)
            break

    if requested_provider not in seen_providers:
        chain.append(
            ProviderConfig(
                name=requested_provider,
                model=requested_model,
                timeout_seconds=DEFAULT_TIMEOUT_SECONDS,
            )
        )
        seen_providers.add(requested_provider)

    for base_config in PROVIDER_CHAIN:
        if base_config.name in seen_providers:
            continue
        chain.append(base_config)
        seen_providers.add(base_config.name)

    return chain


def _append_provider_log(log: ProviderAttemptLog) -> None:
    with _PROVIDER_LOG_LOCK:
        _PROVIDER_LOGS.append(log)


def _call_provider_with_timeout(config: ProviderConfig, system_message: str, question: str) -> ProviderResult:
    hard_timeout_seconds = float(
        os.getenv("CHAT_PROVIDER_HARD_TIMEOUT_SECONDS", str(config.timeout_seconds))
    )
    result_queue: queue.Queue[tuple[str, ProviderResult | Exception]] = queue.Queue(maxsize=1)

    def runner() -> None:
        try:
            result_queue.put(("result", _call_provider_sync(config, system_message, question)))
        except Exception as exc:  # pragma: no cover - mirrored to caller
            result_queue.put(("error", exc))

    worker = threading.Thread(target=runner, daemon=True)
    worker.start()
    try:
        result_type, payload = result_queue.get(timeout=hard_timeout_seconds)
    except queue.Empty as exc:
        raise ChatProviderTimeoutError(
            f"Provider call exceeded hard timeout of {hard_timeout_seconds} seconds"
        ) from exc

    if result_type == "error":
        raise payload  # type: ignore[misc]
    return payload  # type: ignore[return-value]


def _classify_and_raise(exc: Exception) -> None:
    msg = str(exc).lower()
    if "timeout" in msg or "timed out" in msg:
        raise ChatProviderTimeoutError(str(exc)) from exc
    if "429" in msg or "quota" in msg or "rate limit" in msg or "rate_limit" in msg or "resource_exhausted" in msg:
        raise ChatProviderQuotaError(str(exc)) from exc
    if "500" in msg or "internal server error" in msg or "server error" in msg:
        raise ChatProviderError(str(exc)) from exc
    if "api key" in msg or "api_key" in msg or "unauthorized" in msg or "401" in msg or "permission" in msg or "invalid key" in msg:
        raise ChatProviderAuthError(str(exc)) from exc
    if "connection" in msg or "network" in msg or "dns" in msg or "unreachable" in msg or "refused" in msg:
        raise ChatProviderNetworkError(str(exc)) from exc
    raise ChatProviderError(str(exc)) from exc


def _coerce_provider_exception(exc: Exception) -> ChatProviderError | ChatProviderTimeoutError:
    if isinstance(
        exc,
        (
            ChatProviderTimeoutError,
            ChatProviderQuotaError,
            ChatProviderAuthError,
            ChatProviderNetworkError,
            ChatProviderError,
        ),
    ):
        return exc
    try:
        _classify_and_raise(exc)
    except (
        ChatProviderTimeoutError,
        ChatProviderQuotaError,
        ChatProviderAuthError,
        ChatProviderNetworkError,
        ChatProviderError,
    ) as classified_exc:
        return classified_exc
    return ChatProviderError(str(exc))


def _call_provider_sync(config: ProviderConfig, system_message: str, question: str) -> ProviderResult:
    try:
        return _dispatch_provider_call(config, system_message, question)
    except (ChatProviderTimeoutError, ChatProviderQuotaError, ChatProviderAuthError, ChatProviderNetworkError):
        raise
    except ChatProviderError as exc:
        _classify_and_raise(exc)
    except Exception as exc:
        _classify_and_raise(exc)


def _dispatch_provider_call(config: ProviderConfig, system_message: str, question: str) -> ProviderResult:
    if config.name == "openai":
        return _call_openai(config.model, system_message, question, config.timeout_seconds)
    if config.name == "anthropic":
        return _call_anthropic(config.model, system_message, question, config.timeout_seconds)
    if config.name == "gemini":
        return _call_gemini(config.model, system_message, question, config.timeout_seconds)
    raise ChatProviderError(f"Unsupported provider: {config.name}")


def _create_openai_client(timeout_seconds: float) -> Any:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ChatProviderError("OPENAI_API_KEY is missing from ai-service/.env")
    if OpenAI is None:
        raise ChatProviderError("openai package is not installed. Run pip install -r requirements.txt")
    return OpenAI(api_key=api_key, timeout=timeout_seconds, max_retries=DEFAULT_MAX_RETRIES)


def _create_anthropic_client(timeout_seconds: float) -> Any:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ChatProviderError("ANTHROPIC_API_KEY is missing from ai-service/.env")
    if Anthropic is None:
        raise ChatProviderError("anthropic package is not installed. Run pip install -r requirements.txt")
    return Anthropic(api_key=api_key, timeout=timeout_seconds, max_retries=DEFAULT_MAX_RETRIES)


def _create_gemini_client(timeout_seconds: float) -> Any:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ChatProviderError("GEMINI_API_KEY is missing from ai-service/.env")
    if genai is None or genai_types is None:
        raise ChatProviderError("google-genai package is not installed. Run pip install -r requirements.txt")
    return genai.Client(
        api_key=api_key,
        http_options=genai_types.HttpOptions(
            client_args={"timeout": timeout_seconds},
            async_client_args={"timeout": timeout_seconds},
        ),
    )


def _call_openai(model: str, system_message: str, question: str, timeout_seconds: float) -> ProviderResult:
    client = _create_openai_client(timeout_seconds)
    started_at = time.perf_counter()
    response = client.responses.create(
        model=model,
        input=[
            {"role": "system", "content": system_message},
            {"role": "user", "content": question},
        ],
        max_output_tokens=120,
    )
    usage = response.usage
    return ProviderResult(
        answer=response.output_text.strip(),
        latency_seconds=time.perf_counter() - started_at,
        input_tokens=getattr(usage, "input_tokens", 0),
        output_tokens=getattr(usage, "output_tokens", 0),
        provider="openai",
        model=model,
    )


def _call_anthropic(model: str, system_message: str, question: str, timeout_seconds: float) -> ProviderResult:
    client = _create_anthropic_client(timeout_seconds)
    started_at = time.perf_counter()
    response = client.messages.create(
        model=model,
        system=system_message,
        messages=[{"role": "user", "content": question}],
        max_tokens=120,
    )
    answer = "".join(
        block.text for block in response.content if getattr(block, "type", "") == "text"
    ).strip()
    return ProviderResult(
        answer=answer,
        latency_seconds=time.perf_counter() - started_at,
        input_tokens=getattr(response.usage, "input_tokens", 0),
        output_tokens=getattr(response.usage, "output_tokens", 0),
        provider="anthropic",
        model=model,
    )


def _call_gemini(model: str, system_message: str, question: str, timeout_seconds: float) -> ProviderResult:
    client = _create_gemini_client(timeout_seconds)
    max_retries = int(os.getenv("LISAN_MAX_RETRIES", str(DEFAULT_MAX_RETRIES)))
    base_delay = float(os.getenv("LISAN_REQUEST_DELAY_SECONDS", str(DEFAULT_REQUEST_DELAY_SECONDS)))
    attempt = 0
    while True:
        if attempt == 0 and base_delay > 0:
            time.sleep(base_delay)
        started_at = time.perf_counter()
        try:
            response = client.models.generate_content(
                model=model,
                contents=question,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system_message,
                    temperature=0.2,
                    max_output_tokens=120,
                ),
            )
            usage = getattr(response, "usage_metadata", None)
            return ProviderResult(
                answer=(response.text or "").strip(),
                latency_seconds=time.perf_counter() - started_at,
                input_tokens=getattr(usage, "prompt_token_count", 0) if usage else 0,
                output_tokens=getattr(usage, "candidates_token_count", 0) if usage else 0,
                provider="gemini",
                model=model,
            )
        except Exception as exc:
            attempt += 1
            is_quota = "429" in str(exc)
            if attempt > max_retries or not is_quota:
                _classify_and_raise(exc)
            retry_delay = _parse_retry_delay_seconds(str(exc)) or max(6.0, base_delay)
            time.sleep(retry_delay)


def _parse_retry_delay_seconds(message: str) -> float | None:
    match = re.search(r"retry in ([0-9]+(?:\.[0-9]+)?)s", message, flags=re.IGNORECASE)
    if not match:
        return None
    return float(match.group(1))


provider_circuit = get_provider_circuit(DEFAULT_PROVIDER)
