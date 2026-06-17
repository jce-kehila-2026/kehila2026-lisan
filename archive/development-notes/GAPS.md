# Lisan Platform — Gap Analysis & Fix Tracker
> Generated: 2026-05-29 | Scope: ai-service + backend only (Frontend OFF LIMITS)

---

## Legend
- 🔴 HIGH — blocks functionality or causes silent data loss
- 🟡 MEDIUM — degrades feature correctness
- 🟢 LOW — polish / clarity

---

## G01 🔴 — `voiceMode` flag never sent from backend to ai-service (text chat)
**File:** `backend/src/services/aiChatService.js` → `sendChatMessageToAi()`
**Problem:** ai-service uses `voiceMode` to cap output tokens (voice=50, text=120). Backend never sets it, so every text chat response is silently capped wrong.
**Fix:** Pass `voiceMode: false` in the JSON body (already correct for text; voice flow uses voice endpoint).
**Status:** ✅ DONE

---

## G02 🔴 — `BACKEND_URL` missing from `ai-service/.env.example`
**File:** `ai-service/.env.example`
**Problem:** `vocab_tracker.py` reads `os.getenv("BACKEND_URL")`. Not documented → vocab tracking silently disabled in every new deployment.
**Fix:** Add `BACKEND_URL=http://localhost:3000` with comment.
**Status:** ✅ DONE

---

## G03 🔴 — `redis` package missing from `ai-service/requirements.txt`
**File:** `ai-service/requirements.txt`
**Problem:** `redis_client.py` imports `redis` but the package is not declared. Falls back to in-memory silently; multi-instance deployments lose session memory.
**Fix:** Add `redis>=5.0.0` (or pin latest stable).
**Status:** ✅ DONE

---

## G04 🔴 — Conversation memory is in-process singleton (not Redis-backed by default)
**File:** `ai-service/services/conversation_memory.py`
**Problem:** `CONVERSATION_MEMORY` is a module-level dict. Two ai-service instances = split sessions. Redis client exists but is never wired into conversation memory.
**Fix:** Wire `redis_client` into `ConversationMemory` so sessions survive restarts and work across replicas.
**Status:** ✅ DONE

---

## G05 🔴 — `userId` never included in text-chat JSON body sent to ai-service
**File:** `backend/src/services/aiChatService.js` → `sendChatMessageToAi()`
**Problem:** `userId` is accepted as param but only forwarded as `X-User-ID` header (which ai-service ignores for text chat). `ChatRequest` schema has no `userId` field, so it's never used for vocab tracking on text messages.
**Fix:** Add `userId` field to `ChatRequest` Pydantic schema; read it inside `generate_chat_response()`; pass it to `track_vocab_async()`.
**Status:** ✅ DONE

---

## G06 🔴 — Backend has zero test files
**File:** `backend/src/` (all)
**Problem:** `package.json` declares `"test": "node --test"` but there are no `*.test.js` or `*.spec.js` files. Any regression in routing or controller logic goes undetected.
**Fix:** Add tests for the two highest-risk controllers: `chatController` (sendAiMessage, sendVoiceMessage) and the new streaming/analytics proxy routes.
**Status:** ✅ DONE

---

## G07 🟡 — `contextChunkIds` & `cacheHit` / `routerHit` dropped by backend
**File:** `backend/src/controllers/chatController.js` → `sendAiMessage()`
**Problem:** ai-service returns `contextChunkIds`, `cacheHit`, `routerHit` in `ChatResponse` but backend never forwards them. Useful for client-side debugging and analytics.
**Fix:** Include these fields in the JSON response returned to the client.
**Status:** ✅ DONE

---

## G08 🟡 — No backend proxy for `POST /api/ai/pronunciation/assess`
**File:** `backend/src/routes/` (missing)
**Problem:** Pronunciation assessment is only invoked internally (voice pipeline). There is no standalone route exposed through backend, so a teacher dashboard or standalone practice feature can't call it directly.
**Fix:** Add `POST /api/chats/:chatId/pronunciation` proxy route in `backend/src/routes/chats.js`.
**Status:** ✅ DONE

---

## G09 🟡 — No backend proxy for `GET /api/ai/logs`
**File:** `backend/src/routes/admin.js`
**Problem:** ai-service exposes `GET /api/ai/logs?provider=&status=&limit=` for debugging provider failures. Admins have no way to access these logs through the backend.
**Fix:** Add `GET /api/admin/ai/logs` admin-only proxy in `admin.js`.
**Status:** ✅ DONE

---

## G10 🟡 — Streaming proxy doesn't signal error vs. normal end to client
**File:** `backend/src/routes/chats.js` → `POST /:chatId/stream`
**Problem:** Both normal stream end and upstream errors call `res.end()` silently. Client can't distinguish a clean `[DONE]` from a dropped connection.
**Fix:** On upstream error, write `data: [ERROR]\n\n` before ending the response.
**Status:** ✅ DONE

---

## G11 🟡 — `answerAr` never forwarded in text chat response
**File:** `backend/src/controllers/chatController.js` → `sendAiMessage()`
**Problem:** ai-service returns `answerAr` (Arabic translation, used when `includeArabic=true`). Backend persists only `answerHe` and doesn't forward `answerAr` to clients.
**Fix:** Include `answerAr` in the `aiMessage` object saved to Firestore and returned to client.
**Status:** ✅ DONE

---

## G12 🟡 — `vocab_tracker.py` endpoint path hardcoded
**File:** `ai-service/services/vocab_tracker.py`
**Problem:** `_VOCAB_ENDPOINT` is built as `BACKEND_URL + "/api/vocab/progress"`. If the backend route changes the path, vocab tracking breaks silently with no way to override.
**Fix:** Read endpoint from env var `VOCAB_TRACK_PATH` with default `/api/vocab/progress`.
**Status:** ✅ DONE

---

## G13 🟡 — `GuardrailReport` schema missing grammar error details
**File:** `ai-service/services/chat_schemas.py`
**Problem:** `GuardrailReport` only has `vocabularyLeakage` + `blockedTokens`. Grammar errors detected by `grammar_rules.py` are injected into the system prompt but never surfaced in the response schema — clients can't see what was corrected.
**Fix:** Add optional `grammarErrors: list[str]` field to `GuardrailReport`; populate it in `generate_chat_response()`.
**Status:** ✅ DONE

---

## G14 🟢 — `VOCAB_TRACKING_BACKEND_URL` in `backend/.env.example` is unused
**File:** `backend/.env.example`
**Problem:** Variable was added for documentation purposes but backend code never reads it. Creates confusion — vocab tracking is initiated by ai-service, not backend.
**Fix:** Remove the variable or replace with a clear comment explaining the direction of the call.
**Status:** ✅ DONE

---

## G15 🟢 — `ai-service/.env.example` doesn't exist
**File:** `ai-service/` (missing)
**Problem:** There is no `.env.example` in ai-service. All required vars (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `BACKEND_URL`, `AI_SERVICE_INTERNAL_SECRET`, `REDIS_URL`) are undocumented for new developers.
**Fix:** Create `ai-service/.env.example` with all required and optional vars.
**Status:** ✅ DONE

---

## Fix Order (by impact)

| # | Gap | Severity | Effort |
|---|-----|----------|--------|
| 1 | G15 — Create ai-service/.env.example | 🔴 | Small |
| 2 | G02 — Add BACKEND_URL to ai-service env | 🔴 | Trivial |
| 3 | G03 — Add redis to requirements.txt | 🔴 | Trivial |
| 4 | G05 — Add userId to ChatRequest + vocab tracking | 🔴 | Medium |
| 5 | G01 — voiceMode flag from backend | 🔴 | Small |
| 6 | G04 — Wire Redis into ConversationMemory | 🔴 | Medium |
| 7 | G07 — Forward contextChunkIds/cacheHit/routerHit | 🟡 | Small |
| 8 | G11 — Forward answerAr in text chat | 🟡 | Small |
| 9 | G13 — Add grammarErrors to GuardrailReport | 🟡 | Small |
| 10 | G12 — Make vocab endpoint path configurable | 🟡 | Small |
| 11 | G09 — Add /api/admin/ai/logs proxy | 🟡 | Small |
| 12 | G08 — Add pronunciation proxy route | 🟡 | Small |
| 13 | G10 — Streaming error signal | 🟡 | Small |
| 14 | G14 — Clean up unused env var | 🟢 | Trivial |
| 15 | G06 — Backend tests | 🔴 | Large |
