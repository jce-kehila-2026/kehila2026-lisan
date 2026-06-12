# Post-Integration Review Checklist

Use this after the heavy chatbot enhancement branch lands. The goal is to keep
the SaaS stable while accepting useful improvements.

## Must Pass

- Existing deterministic chat tests pass.
- Mixed-language eval passes with zero failures.
- Provider quota fallback still works and is not cached as a permanent answer.
- Startup succeeds when optional heavy dependencies are missing.
- Dense retrieval, reranker, semantic cache, Langfuse, Instructor, and Ragas are
  all disabled by default unless explicitly enabled by env vars.
- Current sparse retrieval remains available as fallback.
- No model download happens during import time.
- No production request blocks on first-time model download.
- No user-facing response exposes trace/debug/internal routing details.
- Arabic-Hebrew mixed messages do not get rejected before gatekeeper/templates.

## Required Env Flags

These flags should exist and default to safe values:

- `ENABLE_DENSE_RETRIEVAL=false`
- `ENABLE_RERANKER=false`
- `ENABLE_SEMANTIC_CACHE=false`
- `ENABLE_LANGFUSE=false`
- `ENABLE_INSTRUCTOR=false`
- `ENABLE_SETFIT_INTENT=false`
- `ENABLE_RAGAS_EVAL=false`
- `ENABLE_OTEL=false`
- `ENABLE_SLOWAPI_RATE_LIMIT=false`
- `SENTRY_TRACES_SAMPLE_RATE=0.0`
- `CHAT_DEBUG_TRACE=false`

## Dependency Risk Checks

- `sqlite-vec` import failure falls back to SQLite FTS/sparse retrieval.
- `sentence-transformers`/BGE model load failure falls back to current retrieval.
- `faiss-cpu` import failure disables semantic cache only.
- `langfuse`/Sentry/OpenTelemetry import failure does not break chat requests.
- SlowAPI rate limit failures return a controlled 429 response, not a 500.

## Retrieval Quality Checks

Run a fixed retrieval benchmark before enabling dense retrieval in production:

- At least 50 Arabic/Hebrew/mixed queries.
- Compare current sparse retrieval vs dense vs hybrid.
- Track top-1/top-3 hit quality.
- Track average and p95 retrieval latency.
- Enable hybrid retrieval only if it improves quality without unacceptable p95
  latency.

## Semantic Cache Safety

Only allow semantic cache for low-risk intents:

- word meaning
- short translation
- known phrase
- simple examples

Do not use semantic cache for:

- personal memory questions
- multi-turn context questions
- grammar correction with student-specific mistakes
- formal complaint/drafting
- anything with retrieval context changes

Cache key must include:

- intent
- level
- normalized target word or phrase
- language/profile category

## Verification Commands

From `ai-service`:

```powershell
python -m compileall services evals tests
python evals\run_expected_behavior_eval.py
python evals\run_mixed_language_eval.py
python -m pytest tests/test_bug_fixes.py tests/test_day2_speed_layer.py tests/test_hebrew_only_behavior.py tests/test_semantic_retrieval.py tests/test_streaming.py tests/test_free_quality_services.py tests/test_language_profile_trace.py
```

If new tests are added for dense retrieval/cache/observability, run them too:

```powershell
python -m pytest tests -k "retrieval or cache or trace or observability or language or intent"
```

## Manual Smoke Tests

Test these before shipping:

- `شو يعني בית؟`
- `ما معنى תור؟`
- `מה זה אומר בית?`
- `صحح: אני רוצים מים`
- `תודה`
- `נעים מאוד`
- `אני רוצה לכתוב תלונה קצרה בסגנון רשמי`
- `אלגוריתמים גנטיים ורשתות נוירונים`
- empty message
- repeated identical question to confirm cache behavior

## Reject The Integration If

- Any optional dependency can crash startup.
- Any heavy model downloads during import.
- Provider quota fallback gets cached.
- Dense retrieval replaces sparse retrieval without fallback.
- Semantic cache answers session-sensitive questions.
- p95 chat latency increases heavily with default env settings.
- Tests pass only when external services are running.
