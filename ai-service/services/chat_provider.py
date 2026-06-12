from __future__ import annotations

import os
import queue
import re
import threading
import time
import json
import urllib.error
import urllib.request
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Iterator

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

# Voice mode uses tighter limits to hit the <3 s latency budget
VOICE_MAX_OUTPUT_TOKENS = 60    # short spoken answer
VOICE_TEMPERATURE = 0.1         # more deterministic → faster sampling
VOICE_TIMEOUT_SECONDS = 8.0     # env: VOICE_PROVIDER_TIMEOUT_SECONDS


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    model: str
    timeout_seconds: float


@dataclass(frozen=True)
class ProviderCallOptions:
    """Runtime options forwarded from the calling layer to the LLM call."""
    voice_mode: bool = False
    max_output_tokens: int = 120
    temperature: float = 0.2
    history: tuple[dict, ...] = ()


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
    provider: str = ""
    model: str = ""
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
]

def _build_fallback_chain() -> list[ProviderConfig]:
    chain = list(PROVIDER_CHAIN)
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    if groq_key:
        chain.append(
            ProviderConfig(
                name="groq",
                model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip()
                or "llama-3.3-70b-versatile",
                timeout_seconds=float(os.getenv("GROQ_TIMEOUT_SECONDS", "8.0")),
            )
        )
    cloudflare_token = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
    cloudflare_account = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
    if cloudflare_token and cloudflare_account:
        chain.append(
            ProviderConfig(
                name="cloudflare",
                model=os.getenv(
                    "CLOUDFLARE_AI_MODEL",
                    "@cf/meta/llama-4-scout-17b-16e-instruct",
                ).strip()
                or "@cf/meta/llama-4-scout-17b-16e-instruct",
                timeout_seconds=float(os.getenv("CLOUDFLARE_AI_TIMEOUT_SECONDS", "8.0")),
            )
        )
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if anthropic_key:
        chain.append(ProviderConfig(name="anthropic", model="claude-3-5-sonnet-20241022", timeout_seconds=10.0))
    return chain

_PROVIDER_CIRCUITS: dict[str, CircuitBreaker] = {}

def _init_provider_circuits() -> None:
    global _PROVIDER_CIRCUITS
    chain = _build_fallback_chain()
    _PROVIDER_CIRCUITS = {config.name: CircuitBreaker() for config in chain}

_init_provider_circuits()
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


def call_provider(
    provider: str,
    model: str,
    system_message: str,
    question: str,
    options: ProviderCallOptions | None = None,
) -> ProviderResult:
    opts = options or ProviderCallOptions()
    attempts: list[ProviderAttemptLog] = []
    failures: list[ProviderFailure] = []
    # Total wall-clock budget across ALL retries and providers. Without it,
    # timeout-retry × hard-timeout × key-rotation compounded to a 22 s wait
    # before the user even saw a fallback (measured in the live probe).
    total_budget_seconds = float(os.getenv("PROVIDER_TOTAL_BUDGET_SECONDS", "10"))
    call_started = time.monotonic()

    def _budget_left() -> bool:
        return (time.monotonic() - call_started) < total_budget_seconds

    for config in _build_provider_chain(provider, model, opts):
        # Budget exhausted after at least one real attempt → degrade now
        # rather than keep the user waiting on more providers/keys.
        if failures and not _budget_left():
            break
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

        last_timeout_exc = None
        for retry_attempt in range(3):
            try:
                result = _call_provider_with_timeout(
                    config, system_message, question, opts
                )
                result = _validate_and_fix_token_counts(result)
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
            except ChatProviderTimeoutError as timeout_exc:
                last_timeout_exc = timeout_exc
                if retry_attempt < 2 and _budget_left():
                    time.sleep(0.1 * (retry_attempt + 1))
                    continue
                exc = timeout_exc
            except Exception as raw_exc:
                exc = _coerce_provider_exception(raw_exc)

            if not isinstance(exc, ChatProviderQuotaError):
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
            break

    raise AllProvidersFailedError(failures)


def _build_provider_chain(
    provider: str,
    model: str,
    opts: ProviderCallOptions | None = None,
) -> list[ProviderConfig]:
    requested_provider = (provider or DEFAULT_PROVIDER).strip().lower() or DEFAULT_PROVIDER
    requested_model = (model or DEFAULT_MODEL).strip() or DEFAULT_MODEL

    voice_timeout = float(
        os.getenv("VOICE_PROVIDER_TIMEOUT_SECONDS", str(VOICE_TIMEOUT_SECONDS))
    )

    def _effective_timeout(base: ProviderConfig) -> float:
        if opts and opts.voice_mode:
            return voice_timeout
        return base.timeout_seconds

    chain: list[ProviderConfig] = []
    seen_providers: set[str] = set()

    for base_config in PROVIDER_CHAIN:
        if base_config.name == requested_provider:
            chain.append(
                ProviderConfig(
                    name=base_config.name,
                    model=requested_model,
                    timeout_seconds=_effective_timeout(base_config),
                )
            )
            seen_providers.add(base_config.name)
            break

    if requested_provider not in seen_providers:
        timeout = voice_timeout if (opts and opts.voice_mode) else DEFAULT_TIMEOUT_SECONDS
        chain.append(
            ProviderConfig(
                name=requested_provider,
                model=requested_model,
                timeout_seconds=timeout,
            )
        )
        seen_providers.add(requested_provider)

    fallback_chain = _build_fallback_chain()
    for base_config in fallback_chain:
        if base_config.name in seen_providers:
            continue
        chain.append(
            ProviderConfig(
                name=base_config.name,
                model=base_config.model,
                timeout_seconds=_effective_timeout(base_config),
            )
        )
        seen_providers.add(base_config.name)

    # Re-order so providers whose circuit is OPEN go to the END of the chain.
    # Prevents wasting latency on a known-broken provider while still falling
    # back to it as a last resort if every healthy provider has also failed.
    def _circuit_open(name: str) -> bool:
        try:
            return not get_provider_circuit(name).allow_request()
        except Exception:
            return False

    chain.sort(key=lambda c: 1 if _circuit_open(c.name) else 0)
    return chain


def _append_provider_log(log: ProviderAttemptLog) -> None:
    with _PROVIDER_LOG_LOCK:
        _PROVIDER_LOGS.append(log)


def _call_provider_with_timeout(
    config: ProviderConfig,
    system_message: str,
    question: str,
    opts: ProviderCallOptions | None = None,
) -> ProviderResult:
    hard_timeout_seconds = float(
        os.getenv("CHAT_PROVIDER_HARD_TIMEOUT_SECONDS", str(config.timeout_seconds))
    )
    result_queue: queue.Queue[tuple[str, ProviderResult | Exception]] = queue.Queue(maxsize=1)

    def runner() -> None:
        try:
            result_queue.put(("result", _call_provider_sync(config, system_message, question, opts)))
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


def _call_provider_sync(
    config: ProviderConfig,
    system_message: str,
    question: str,
    opts: ProviderCallOptions | None = None,
) -> ProviderResult:
    try:
        return _dispatch_provider_call(config, system_message, question, opts)
    except (ChatProviderTimeoutError, ChatProviderQuotaError, ChatProviderAuthError, ChatProviderNetworkError):
        raise
    except ChatProviderError as exc:
        _classify_and_raise(exc)
    except Exception as exc:
        _classify_and_raise(exc)


def _dispatch_provider_call(
    config: ProviderConfig,
    system_message: str,
    question: str,
    opts: ProviderCallOptions | None = None,
) -> ProviderResult:
    o = opts or ProviderCallOptions()
    if config.name == "openai":
        return _call_openai(config.model, system_message, question, config.timeout_seconds, o)
    if config.name == "anthropic":
        return _call_anthropic(config.model, system_message, question, config.timeout_seconds, o)
    if config.name == "gemini":
        return _call_gemini(config.model, system_message, question, config.timeout_seconds, o)
    if config.name == "groq":
        return _call_groq(config.model, system_message, question, config.timeout_seconds, o)
    if config.name == "cloudflare":
        return _call_cloudflare_workers_ai(config.model, system_message, question, config.timeout_seconds, o)
    raise ChatProviderError(f"Unsupported provider: {config.name}")


def _create_openai_client(timeout_seconds: float) -> Any:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ChatProviderError("OPENAI_API_KEY is missing from ai-service/.env")
    if OpenAI is None:
        raise ChatProviderError("openai package is not installed. Run pip install -r requirements.txt")
    return OpenAI(api_key=api_key, timeout=timeout_seconds, max_retries=DEFAULT_MAX_RETRIES)


def _create_groq_client(timeout_seconds: float) -> Any:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        raise ChatProviderError("GROQ_API_KEY is missing from ai-service/.env")
    if OpenAI is None:
        raise ChatProviderError("openai package is not installed. Run pip install -r requirements.txt")
    return OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1",
        timeout=timeout_seconds,
        max_retries=DEFAULT_MAX_RETRIES,
    )


def _create_anthropic_client(timeout_seconds: float) -> Any:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ChatProviderError("ANTHROPIC_API_KEY is missing from ai-service/.env")
    if Anthropic is None:
        raise ChatProviderError("anthropic package is not installed. Run pip install -r requirements.txt")
    return Anthropic(api_key=api_key, timeout=timeout_seconds, max_retries=DEFAULT_MAX_RETRIES)


_GEMINI_KEY_LOCK = threading.Lock()
_gemini_key_cursor = 0


def _get_gemini_keys() -> list[str]:
    """
    Return the configured Gemini API keys, de-duplicated, in order.

    Reads GEMINI_API_KEYS (comma-separated) first, falling back to the legacy
    single GEMINI_API_KEY. Each key should come from a DIFFERENT Google Cloud
    project so they each carry their own independent free-tier quota.
    """
    raw = (
        os.getenv("GEMINI_API_KEYS", "").strip()
        or os.getenv("GEMINI_API_KEY", "").strip()
    )
    keys: list[str] = []
    seen: set[str] = set()
    for part in raw.split(","):
        key = part.strip()
        if key and key not in seen:
            seen.add(key)
            keys.append(key)
    return keys


def _next_gemini_start_index(n: int) -> int:
    """Round-robin starting point so load is spread across keys, not always #1."""
    global _gemini_key_cursor
    with _GEMINI_KEY_LOCK:
        idx = _gemini_key_cursor % n
        _gemini_key_cursor = (_gemini_key_cursor + 1) % n
        return idx


def _create_gemini_client(timeout_seconds: float, api_key: str) -> Any:
    if not api_key:
        raise ChatProviderError(
            "No Gemini API key configured. Set GEMINI_API_KEYS (comma-separated) "
            "or GEMINI_API_KEY in ai-service/.env"
        )
    if genai is None or genai_types is None:
        raise ChatProviderError("google-genai package is not installed. Run pip install -r requirements.txt")
    return genai.Client(
        api_key=api_key,
        http_options=genai_types.HttpOptions(
            client_args={"timeout": timeout_seconds},
            async_client_args={"timeout": timeout_seconds},
        ),
    )


def _call_openai(
    model: str,
    system_message: str,
    question: str,
    timeout_seconds: float,
    opts: ProviderCallOptions | None = None,
) -> ProviderResult:
    o = opts or ProviderCallOptions()
    client = _create_openai_client(timeout_seconds)
    started_at = time.perf_counter()
    messages = (
        [{"role": "system", "content": system_message}]
        + list(o.history)
        + [{"role": "user", "content": question}]
    )
    response = client.responses.create(
        model=model,
        input=messages,
        max_output_tokens=o.max_output_tokens,
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


def _call_anthropic(
    model: str,
    system_message: str,
    question: str,
    timeout_seconds: float,
    opts: ProviderCallOptions | None = None,
) -> ProviderResult:
    o = opts or ProviderCallOptions()
    client = _create_anthropic_client(timeout_seconds)
    started_at = time.perf_counter()
    messages = list(o.history) + [{"role": "user", "content": question}]
    response = client.messages.create(
        model=model,
        system=system_message,
        messages=messages,
        max_tokens=o.max_output_tokens,
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


def _call_groq(
    model: str,
    system_message: str,
    question: str,
    timeout_seconds: float,
    opts: ProviderCallOptions | None = None,
) -> ProviderResult:
    o = opts or ProviderCallOptions()
    client = _create_groq_client(timeout_seconds)
    started_at = time.perf_counter()
    messages = (
        [{"role": "system", "content": system_message}]
        + list(o.history)
        + [{"role": "user", "content": question}]
    )
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=o.max_output_tokens,
        temperature=o.temperature,
    )
    answer = (response.choices[0].message.content or "").strip()
    usage = response.usage
    return ProviderResult(
        answer=answer,
        latency_seconds=time.perf_counter() - started_at,
        input_tokens=getattr(usage, "prompt_tokens", 0) if usage else 0,
        output_tokens=getattr(usage, "completion_tokens", 0) if usage else 0,
        provider="groq",
        model=model,
    )


def _call_cloudflare_workers_ai(
    model: str,
    system_message: str,
    question: str,
    timeout_seconds: float,
    opts: ProviderCallOptions | None = None,
) -> ProviderResult:
    o = opts or ProviderCallOptions()
    token = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
    if not token or not account_id:
        raise ChatProviderError(
            "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required for Cloudflare Workers AI"
        )

    messages = (
        [{"role": "system", "content": system_message}]
        + list(o.history)
        + [{"role": "user", "content": question}]
    )
    body = json.dumps(
        {
            "messages": messages,
            "max_tokens": o.max_output_tokens,
            "temperature": o.temperature,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    started_at = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        raise ChatProviderError(f"Cloudflare Workers AI HTTP {exc.code}: {body_text[:300]}") from exc
    except TimeoutError as exc:
        raise ChatProviderTimeoutError("Cloudflare Workers AI request timed out") from exc

    if not payload.get("success", False):
        raise ChatProviderError(f"Cloudflare Workers AI error: {payload.get('errors') or payload}")

    result = payload.get("result") or {}
    answer = (result.get("response") or "").strip()
    if not answer:
        choices = result.get("choices") or []
        if choices:
            answer = (((choices[0].get("message") or {}).get("content")) or "").strip()

    usage = result.get("usage") or {}
    return ProviderResult(
        answer=answer,
        latency_seconds=time.perf_counter() - started_at,
        input_tokens=usage.get("prompt_tokens", 0) or usage.get("input_tokens", 0) or 0,
        output_tokens=usage.get("completion_tokens", 0) or usage.get("output_tokens", 0) or 0,
        provider="cloudflare",
        model=model,
    )


def _gemini_supports_disable_thinking(model: str) -> bool:
    """gemini-2.5 flash & flash-lite allow thinking_budget=0 (full disable).

    2.5-pro cannot fully disable thinking, so we only target flash models. A
    short tutor reply needs no chain-of-thought, and on 2.5 the hidden thinking
    tokens are billed against max_output_tokens.
    """
    return "flash" in (model or "").lower()


def _build_gemini_config(
    system_message: str,
    o: ProviderCallOptions,
    model: str,
) -> "genai_types.GenerateContentConfig":
    """GenerateContentConfig with thinking disabled for flash models.

    Root cause this addresses: on gemini-2.5 'thinking' is ON by default and its
    hidden reasoning tokens consume max_output_tokens. That truncated the
    visible answer mid-word, and when thinking ate the whole budget the response
    had no visible text at all (which surfaced downstream as MODEL_ERROR and
    tripped the provider circuit). Disabling it gives the full token budget to
    the actual reply — and is faster and cheaper, which suits the free tier.
    """
    kwargs: dict[str, Any] = dict(
        system_instruction=system_message,
        temperature=o.temperature,
        max_output_tokens=o.max_output_tokens,
    )
    if _gemini_supports_disable_thinking(model):
        try:
            kwargs["thinking_config"] = genai_types.ThinkingConfig(thinking_budget=0)
        except Exception:  # noqa: BLE001 — older SDK without ThinkingConfig
            pass
    return genai_types.GenerateContentConfig(**kwargs)


def _safe_response_text(response: Any) -> str:
    """Extract text WITHOUT letting the SDK raise on an empty/blocked candidate.

    When a candidate finishes with no visible text part (e.g. MAX_TOKENS spent
    on thinking, or a safety block) the genai `response.text` accessor can raise.
    Turning that into a provider exception was wrong: it became a MODEL_ERROR
    that tripped the circuit. An empty answer must instead degrade to
    EMPTY_RESPONSE upstream (which never trips the circuit). Returns "" when no
    text is present.
    """
    try:
        text = response.text
        if text:
            return text
    except Exception:  # noqa: BLE001 — empty/blocked candidate; fall through
        pass
    try:
        collected: list[str] = []
        for candidate in getattr(response, "candidates", None) or []:
            content = getattr(candidate, "content", None)
            for part in getattr(content, "parts", None) or []:
                part_text = getattr(part, "text", None)
                if part_text:
                    collected.append(part_text)
        return "".join(collected)
    except Exception:  # noqa: BLE001
        return ""


def _call_gemini(
    model: str,
    system_message: str,
    question: str,
    timeout_seconds: float,
    opts: ProviderCallOptions | None = None,
) -> ProviderResult:
    o = opts or ProviderCallOptions()
    keys = _get_gemini_keys()
    if not keys:
        raise ChatProviderError(
            "No Gemini API key configured. Set GEMINI_API_KEYS (comma-separated) "
            "or GEMINI_API_KEY in ai-service/.env"
        )

    # Build the request contents once (key-independent).
    # history messages are {"role": "user"/"assistant", "content": "..."}
    # Gemini expects role "model" instead of "assistant".
    if o.history:
        contents: Any = []
        for msg in o.history:
            gemini_role = "model" if msg["role"] == "assistant" else msg["role"]
            contents.append(
                genai_types.Content(
                    role=gemini_role,
                    parts=[genai_types.Part(text=msg["content"])],
                )
            )
        contents.append(
            genai_types.Content(role="user", parts=[genai_types.Part(text=question)])
        )
    else:
        contents = question

    config = _build_gemini_config(system_message, o, model)

    # Round-robin across keys; on a 429 (rate-limit) move to the NEXT key
    # instead of sleeping. Each key is a separate project with its own quota,
    # so this multiplies effective free-tier throughput. Only when EVERY key
    # is rate-limited do we surface a quota error (which, per the cascade fix,
    # degrades gracefully without opening the circuit).
    start = _next_gemini_start_index(len(keys))
    ordered_keys = [keys[(start + i) % len(keys)] for i in range(len(keys))]
    last_exc: Exception | None = None
    for api_key in ordered_keys:
        client = _create_gemini_client(timeout_seconds, api_key)
        started_at = time.perf_counter()
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            usage = getattr(response, "usage_metadata", None)
            return ProviderResult(
                answer=_safe_response_text(response).strip(),
                latency_seconds=time.perf_counter() - started_at,
                input_tokens=getattr(usage, "prompt_token_count", 0) if usage else 0,
                output_tokens=getattr(usage, "candidates_token_count", 0) if usage else 0,
                provider="gemini",
                model=model,
            )
        except Exception as exc:
            last_exc = exc
            if "429" in str(exc):
                # This key is rate-limited — try the next key in the rotation.
                continue
            # Any non-quota error: classify and raise immediately.
            _classify_and_raise(exc)

    # Every key was rate-limited.
    _classify_and_raise(last_exc or ChatProviderQuotaError("All Gemini keys rate-limited"))


def _estimate_token_count(text: str) -> int:
    """
    Rough token estimate: ~4 chars per token.
    Used as fallback when provider doesn't return token counts.
    """
    return max(1, len(text) // 4)


def _validate_and_fix_token_counts(result: ProviderResult) -> ProviderResult:
    """
    Validate that input/output tokens are non-zero.
    If both are zero (provider didn't return), estimate them to catch
    silent billing/quota failures.
    """
    if result.input_tokens == 0 and result.output_tokens == 0:
        est_input = _estimate_token_count(
            "system" + result.answer  # rough estimate
        )
        est_output = _estimate_token_count(result.answer)
        logger.warning(
            {
                "event": "token_count_fallback",
                "provider": result.provider,
                "reason": "provider_returned_zero",
                "estimated_input": est_input,
                "estimated_output": est_output,
            }
        )
        result.input_tokens = est_input
        result.output_tokens = est_output
    return result


def _parse_retry_delay_seconds(message: str) -> float | None:
    match = re.search(r"retry in ([0-9]+(?:\.[0-9]+)?)s", message, flags=re.IGNORECASE)
    if not match:
        return None
    return float(match.group(1))


# ---------------------------------------------------------------------------
# Streaming API
# ---------------------------------------------------------------------------

def stream_provider(
    provider: str,
    model: str,
    system_message: str,
    question: str,
    options: ProviderCallOptions | None = None,
) -> Iterator[str]:
    """
    Yield text tokens from the LLM as they arrive.

    Falls back to the non-streaming call and yields the whole answer as a
    single chunk when the provider's streaming API is unavailable or throws.
    Circuit-breaker and provider-chain logic mirrors call_provider().
    """
    opts = options or ProviderCallOptions()

    for config in _build_provider_chain(provider, model, opts):
        circuit = get_provider_circuit(config.name)
        if not circuit.allow_request():
            continue

        try:
            yield from _stream_provider_impl(config, system_message, question, opts)
            circuit.record_success()
            return
        except Exception as raw_exc:
            circuit.record_failure()
            exc = _coerce_provider_exception(raw_exc)
            # If all chunks already yielded, nothing to retry — just stop.
            # If nothing was yielded yet, fall through to the next provider.
            _append_provider_log(ProviderAttemptLog(
                provider=config.name,
                model=config.model,
                status="failed",
                error_type=exc.__class__.__name__,
                error_message=str(exc),
            ))

    # Last-resort: non-streaming single-chunk fallback
    result = call_provider(provider, model, system_message, question, options)
    yield result.answer


def _stream_provider_impl(
    config: ProviderConfig,
    system_message: str,
    question: str,
    opts: ProviderCallOptions,
) -> Iterator[str]:
    if config.name == "openai":
        yield from _stream_openai(config.model, system_message, question, config.timeout_seconds, opts)
    elif config.name == "anthropic":
        yield from _stream_anthropic(config.model, system_message, question, config.timeout_seconds, opts)
    elif config.name == "gemini":
        yield from _stream_gemini(config.model, system_message, question, config.timeout_seconds, opts)
    elif config.name == "groq":
        yield from _stream_groq(config.model, system_message, question, config.timeout_seconds, opts)
    elif config.name == "cloudflare":
        result = _call_cloudflare_workers_ai(
            config.model,
            system_message,
            question,
            config.timeout_seconds,
            opts,
        )
        if result.answer:
            yield result.answer
    else:
        raise ChatProviderError(f"Unsupported provider for streaming: {config.name}")


def _stream_openai(
    model: str,
    system_message: str,
    question: str,
    timeout_seconds: float,
    opts: ProviderCallOptions,
) -> Iterator[str]:
    client = _create_openai_client(timeout_seconds)
    messages = (
        [{"role": "system", "content": system_message}]
        + list(opts.history)
        + [{"role": "user", "content": question}]
    )
    with client.responses.stream(
        model=model,
        input=messages,
        max_output_tokens=opts.max_output_tokens,
    ) as stream:
        for event in stream:
            delta = getattr(event, "delta", None)
            if delta and isinstance(delta, str):
                yield delta


def _stream_anthropic(
    model: str,
    system_message: str,
    question: str,
    timeout_seconds: float,
    opts: ProviderCallOptions,
) -> Iterator[str]:
    client = _create_anthropic_client(timeout_seconds)
    messages = list(opts.history) + [{"role": "user", "content": question}]
    with client.messages.stream(
        model=model,
        system=system_message,
        messages=messages,
        max_tokens=opts.max_output_tokens,
    ) as stream:
        for text in stream.text_stream:
            yield text


def _stream_groq(
    model: str,
    system_message: str,
    question: str,
    timeout_seconds: float,
    opts: ProviderCallOptions,
) -> Iterator[str]:
    client = _create_groq_client(timeout_seconds)
    messages = (
        [{"role": "system", "content": system_message}]
        + list(opts.history)
        + [{"role": "user", "content": question}]
    )
    stream = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=opts.max_output_tokens,
        temperature=opts.temperature,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


def _stream_gemini(
    model: str,
    system_message: str,
    question: str,
    timeout_seconds: float,
    opts: ProviderCallOptions,
) -> Iterator[str]:
    client = _create_gemini_client(timeout_seconds)
    if opts.history:
        contents = []
        for msg in opts.history:
            gemini_role = "model" if msg["role"] == "assistant" else msg["role"]
            contents.append(
                genai_types.Content(
                    role=gemini_role,
                    parts=[genai_types.Part(text=msg["content"])],
                )
            )
        contents.append(
            genai_types.Content(
                role="user",
                parts=[genai_types.Part(text=question)],
            )
        )
    else:
        contents = question

    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=_build_gemini_config(system_message, opts, model),
    ):
        if chunk.text:
            yield chunk.text


provider_circuit = get_provider_circuit(DEFAULT_PROVIDER)


def call_provider_structured(
    provider: str,
    model: str,
    system_message: str,
    question: str,
    response_model: Any,
    options: ProviderCallOptions | None = None,
) -> Any:
    """Uses Instructor to get structured outputs conforming to response_model Pydantic schema."""
    import instructor
    o = options or ProviderCallOptions()
    
    if provider == "openai":
        client = instructor.from_openai(_create_openai_client(10.0))
        messages = [{"role": "system", "content": system_message}, {"role": "user", "content": question}]
        return client.chat.completions.create(
            model=model,
            messages=messages,
            response_model=response_model,
        )
    if provider == "groq":
        client = instructor.from_openai(_create_groq_client(10.0))
        messages = [{"role": "system", "content": system_message}, {"role": "user", "content": question}]
        return client.chat.completions.create(
            model=model,
            messages=messages,
            response_model=response_model,
        )
    elif provider == "gemini":
        keys = _get_gemini_keys()
        api_key = keys[0] if keys else ""
        raw_client = _create_gemini_client(10.0, api_key)
        client = instructor.from_gemini(raw_client)
        return client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": f"{system_message}\n\nQuestion: {question}"}],
            response_model=response_model,
        )
    raise ValueError(f"Instructor not configured for provider {provider}")
