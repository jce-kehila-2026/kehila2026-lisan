# SaaS Release Readiness

This checklist is for the final delivery pass, separate from feature work.

## Product Surface

- Student can log in and open chat without manual setup.
- Teacher/admin accounts are seeded or documented.
- Chat supports Hebrew, Arabic support text, and mixed Arabic-Hebrew prompts.
- Voice endpoints are either working or clearly disabled in the UI.
- User-facing fallbacks are polite and do not expose provider/internal errors.

## Operational Readiness

- Frontend production URL is configured in `CORS_ALLOWED_ORIGINS`.
- `ENV_MODE=production` is set in production.
- `AI_SERVICE_INTERNAL_SECRET` is configured.
- Provider keys are configured, but startup live LLM validation remains off unless explicitly needed.
- Redis is either configured or intentionally left `not_configured`.
- Health endpoint returns 200: `/api/ai/health`.
- Readiness endpoint is understood: `/api/ai/ready` may be degraded if provider keys are missing in local/dev.

## Safety And Stability

- Rate limiting is active.
- Provider quota fallback is not cached permanently.
- Optional heavy features are behind env flags.
- `ENABLE_SETFIT_INTENT=false` unless a local SetFit model is bundled and tested.
- Startup does not fail when optional observability/dense retrieval dependencies are missing.
- No debug trace is visible to end users.
- `CHAT_DEBUG_TRACE=false` in production unless actively investigating.

## Required Verification

From `ai-service`:

```powershell
python -m compileall services evals tests
python evals\run_expected_behavior_eval.py
python evals\run_mixed_language_eval.py
python -m pytest tests/test_bug_fixes.py tests/test_day2_speed_layer.py tests/test_hebrew_only_behavior.py tests/test_semantic_retrieval.py tests/test_streaming.py tests/test_free_quality_services.py tests/test_language_profile_trace.py
```

With the ai-service server running:

```powershell
python evals\saas_smoke_check.py --base-url http://127.0.0.1:8000
```

If production auth requires an internal secret:

```powershell
python evals\saas_smoke_check.py --base-url https://YOUR_AI_SERVICE --internal-secret $env:AI_SERVICE_INTERNAL_SECRET --fail-on-degraded-ready
```

## Manual Acceptance Prompts

- `شو يعني בית؟`
- `מה זה אומר תור?`
- `صحح: אני רוצים מים`
- `תודה`
- `אני רוצה לכתוב תלונה קצרה בסגנון רשמי`
- `אלגוריתמים גנטיים ורשתות נוירונים`

## Release Blockers

- Login/auth bypass in production.
- Any 500 during normal chat.
- Mixed Arabic-Hebrew prompt rejected before local templates.
- Provider quota causes cascading circuit-open failures.
- Heavy model download happens on first user request.
- p95 chat latency becomes unacceptable with default flags.
- Admin-only logs/analytics exposed without auth through the public backend.
