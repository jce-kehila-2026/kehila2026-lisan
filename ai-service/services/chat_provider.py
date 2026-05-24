from __future__ import annotations

import os
import queue
import re
import threading
import time
from dataclasses import dataclass
from typing import Any

from dotenv import load_dotenv

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


@dataclass
class ProviderResult:
    answer: str
    latency_seconds: float
    input_tokens: int
    output_tokens: int


class ChatProviderError(RuntimeError):
    pass


class ChatProviderTimeoutError(TimeoutError):
    pass


class ChatProviderQuotaError(ChatProviderError):
    """429 / rate-limit / quota exceeded."""
    pass


class ChatProviderAuthError(ChatProviderError):
    """Invalid or missing API key."""
    pass


class ChatProviderNetworkError(ChatProviderError):
    """Network connectivity failure."""
    pass


def get_configured_provider() -> tuple[str, str]:
    provider = os.getenv("LLM_PROVIDER", DEFAULT_PROVIDER).strip().lower() or DEFAULT_PROVIDER
    model = os.getenv("LLM_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    return provider, model


def call_provider(provider: str, model: str, system_message: str, question: str) -> ProviderResult:
    hard_timeout_seconds = float(
        os.getenv("CHAT_PROVIDER_HARD_TIMEOUT_SECONDS", str(DEFAULT_HARD_TIMEOUT_SECONDS))
    )
    result_queue: queue.Queue[tuple[str, ProviderResult | Exception]] = queue.Queue(maxsize=1)

    def runner() -> None:
        try:
            result_queue.put(("result", _call_provider_sync(provider, model, system_message, question)))
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
    if "api key" in msg or "api_key" in msg or "unauthorized" in msg or "401" in msg or "permission" in msg or "invalid key" in msg:
        raise ChatProviderAuthError(str(exc)) from exc
    if "connection" in msg or "network" in msg or "dns" in msg or "unreachable" in msg or "refused" in msg:
        raise ChatProviderNetworkError(str(exc)) from exc
    raise ChatProviderError(str(exc)) from exc


def _call_provider_sync(provider: str, model: str, system_message: str, question: str) -> ProviderResult:
    try:
        return _dispatch_provider_call(provider, model, system_message, question)
    except (ChatProviderTimeoutError, ChatProviderQuotaError, ChatProviderAuthError, ChatProviderNetworkError):
        raise
    except ChatProviderError as exc:
        _classify_and_raise(exc)
    except Exception as exc:
        _classify_and_raise(exc)


def _dispatch_provider_call(provider: str, model: str, system_message: str, question: str) -> ProviderResult:
    if provider == "openai":
        return _call_openai(model, system_message, question)
    if provider == "anthropic":
        return _call_anthropic(model, system_message, question)
    if provider == "gemini":
        return _call_gemini(model, system_message, question)
    raise ChatProviderError(f"Unsupported provider: {provider}")


def _create_openai_client() -> Any:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ChatProviderError("OPENAI_API_KEY is missing from ai-service/.env")
    if OpenAI is None:
        raise ChatProviderError("openai package is not installed. Run pip install -r requirements.txt")
    timeout_seconds = float(os.getenv("CHAT_PROVIDER_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)))
    return OpenAI(api_key=api_key, timeout=timeout_seconds, max_retries=DEFAULT_MAX_RETRIES)


def _create_anthropic_client() -> Any:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ChatProviderError("ANTHROPIC_API_KEY is missing from ai-service/.env")
    if Anthropic is None:
        raise ChatProviderError("anthropic package is not installed. Run pip install -r requirements.txt")
    timeout_seconds = float(os.getenv("CHAT_PROVIDER_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)))
    return Anthropic(api_key=api_key, timeout=timeout_seconds, max_retries=DEFAULT_MAX_RETRIES)


def _create_gemini_client() -> Any:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ChatProviderError("GEMINI_API_KEY is missing from ai-service/.env")
    if genai is None or genai_types is None:
        raise ChatProviderError("google-genai package is not installed. Run pip install -r requirements.txt")
    timeout_seconds = float(os.getenv("CHAT_PROVIDER_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)))
    return genai.Client(
        api_key=api_key,
        http_options=genai_types.HttpOptions(
            client_args={"timeout": timeout_seconds},
            async_client_args={"timeout": timeout_seconds},
        ),
    )


def _call_openai(model: str, system_message: str, question: str) -> ProviderResult:
    client = _create_openai_client()
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
    )


def _call_anthropic(model: str, system_message: str, question: str) -> ProviderResult:
    client = _create_anthropic_client()
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
    )


def _call_gemini(model: str, system_message: str, question: str) -> ProviderResult:
    client = _create_gemini_client()
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
