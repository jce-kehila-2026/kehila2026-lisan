# Lisan Voice Chatbot Handoff

Last verified: 2026-06-07

## Current Status

The `/chatbot` route is wired to the voice-first `ChatbotPage.jsx`. Voice uploads are transcript-first by default: the browser audio is sent to the backend and ai-service for STT, then the resulting `transcribedText` is saved inside the chat session/messages and becomes part of the conversation context. Raw student audio is not stored unless explicitly enabled.

Pronunciation feedback is implemented in the frontend from `pronunciationScore`:

- `>= 80`: excellent
- `>= 60`: good
- `< 60`: practice

## Run Locally

Install dependencies:

```bash
npm run install:all
```

Start the full local stack:

```bash
npm run dev
```

Default local services:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- AI service: `http://localhost:8000`

Open the student voice chatbot at:

```text
http://localhost:5173/chatbot
```

## Demo Flow

1. Start the stack with `npm run dev`.
2. Open `/chatbot`.
3. Sign in or use the configured dev auth flow.
4. Press the microphone button and record a short Hebrew phrase.
5. Confirm that the student message shows the Hebrew transcript.
6. Confirm that the teacher responds in Hebrew.
7. Confirm pronunciation feedback appears when `pronunciationScore` is returned.
8. Open the same conversation again and confirm the transcript/teacher turn is still in history.

By default, the saved history contains the transcript and message metadata, not the raw voice file.

## Verification

Run the full handoff verification with one command:

```bash
npm run verify:handoff
```

This runs:

- `npm run test:ai-service`
- `npm run test:backend`
- `npm run test:frontend`
- `npm run eval:voice-stt`

Latest result from `npm run verify:handoff`:

| Group | Result |
| --- | --- |
| ai-service pytest | `468 passed` |
| backend src tests | `23 passed` |
| backend voice route tests | `17 passed` |
| frontend Vitest | `10 passed` |
| frontend build | `passed` |
| real-STT eval | `18 passed / 0 failed` |

Latest real-STT metrics:

- STT accuracy average: `0.864`
- Pronunciation score average: `97.8`
- STT latency: avg `1148.8ms`, p95 `1321.7ms`, max `1751ms`
- Chat latency: avg `2031.1ms`, p95 `3026.4ms`, max `3077ms`
- Eval latency budget: `6000ms`

Report file:

```text
ai-service/evals/reports/voice_stt_eval_latest.md
```

## Environment Variables

| Service | Variable | Required | Notes |
| --- | --- | --- | --- |
| backend | `PORT` | local yes | Default `3000`. |
| backend | `NODE_ENV` | yes | Use `development` locally, `production` in deploys. |
| backend | `JWT_SECRET` | yes | Must be strong in production. |
| backend | `AI_SERVICE_URL` | yes | Use base URL like `http://127.0.0.1:8000`; endpoint URLs are normalized defensively. |
| backend | `AI_SERVICE_INTERNAL_SECRET` | yes | Must match ai-service. Backend-to-AI trust uses this secret. |
| backend | `CORS_ALLOWED_ORIGINS` | production yes | Include the frontend origin. |
| backend | `FIREBASE_SERVICE_ACCOUNT` or `backend/privateKey.json` | yes | Firestore chat persistence. Do not commit keys. |
| backend | `STORE_VOICE_AUDIO` | no | Default off. Set `true` only if raw student audio should be stored. |
| backend | `FIREBASE_STORAGE_BUCKET` | only if `STORE_VOICE_AUDIO=true` | Not required for transcript-only voice chat. |
| backend | `SKIP_AUTH` | dev only | Use only for local smoke tests. |
| ai-service | `AI_SERVICE_INTERNAL_SECRET` | yes | Must match backend. |
| ai-service | `GEMINI_API_KEY` | yes | Current free-tier LLM provider path. |
| ai-service | `LLM_PROVIDER` / `LLM_MODEL` | yes | Current default is Gemini. |
| ai-service | `JWT_SECRET` | optional | Required only for direct ai-service JWT-authenticated calls. Backend proxy can use the internal secret. |
| ai-service | `STT_ENGINE` | yes for voice | `azure` for fast real-STT; `whisper` for local/free fallback. |
| ai-service | `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | required for Azure STT/pronunciation | Powers Azure STT and pronunciation scoring. |
| ai-service | `USE_AZURE_PRONUNCIATION` | optional | Set `true` to return `pronunciationScore`. |
| ai-service | `BACKEND_URL` / `RAG_BACKEND_URL` | yes for backend RAG/vocab integration | Local default `http://localhost:3000`. |
| ai-service | `REDIS_URL` | production recommended | Without Redis, memory/cache are per-process only. |
| frontend | `VITE_API_PROXY_TARGET` | local optional | Vite `/api` proxy target, default `http://localhost:3000`. |
| frontend | `VITE_SKIP_AUTH*` | dev only | Local dev auth helpers only. |

## Known Limits

- Raw voice audio is not stored by default. This is intentional for the current product direction; transcript and chat context are persisted.
- If `STORE_VOICE_AUDIO=true`, Firebase Storage must be enabled and `FIREBASE_STORAGE_BUCKET` must point to an existing bucket.
- The frontend build still warns about a large main JS chunk and the Whisper WASM asset. The build passes, but code-splitting remains a future optimization.
- Vitest/Vite prints the Vite CJS Node API deprecation warning.
- Backend tests print a Firebase mock circular dependency warning; tests pass.
- ai-service pytest prints framework deprecation warnings and an unregistered `llm` marker warning; tests pass.
- `npm install` for frontend currently reports audit issues from the dependency tree. Do not run `npm audit fix --force` casually because it may introduce broad dependency churn.
- Real-STT eval depends on Azure Speech and Gemini availability. It is a live integration check, not a deterministic unit test.

## Privacy And Keys

- In free-tier mode, teacher responses go through Gemini, so chat text, retrieved context, and transcripts sent to the LLM are processed by Google/Gemini.
- When `STT_ENGINE=azure`, student audio is sent to Azure Speech for transcription. When `USE_AZURE_PRONUNCIATION=true`, audio/transcript are also used for Azure pronunciation scoring.
- Raw student audio is not stored by this app unless `STORE_VOICE_AUDIO=true`.
- Rotate the Azure Speech key before production handoff.
- Rotate any Firebase service-account key that was copied into chat or shared outside the secrets manager.

## Files Added Or Changed For This Handoff

- `frontend/src/services/chat.test.js`: pronunciation and voice fallback tests.
- `frontend/src/i18n/i18nKeys.test.js`: required Arabic/Hebrew chat key coverage.
- `frontend/package.json`: Vitest scripts.
- `package.json`: one-command handoff verification scripts.
- `ai-service/evals/run_voice_stt_eval.py`: real-STT eval reset and latency budget.
- `ai-service/requirements.txt`: explicit `av` and `numpy` dependencies for Azure webm-to-wav conversion.
- `HANDOFF.md`: this handoff guide.
