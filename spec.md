# Lisan Chatbot Product Spec

## 1. Product Goal

Build a student-facing Hebrew tutor chatbot inside the Lisan app.

The chatbot must be:
- constrained to beginner Hebrew learning.
- fast enough for classroom/student use.
- safe against vocabulary leakage.
- reachable from the React app.
- protected by backend authentication.
- persistent through Firestore conversation history.
- honest about limitations.

This is not a general chatbot, not a full AI agent, and not a fine-tuned model.

---

## 2. Current Engineering Baseline

### Existing AI Service

The project already has a FastAPI AI service with:
- `POST /api/ai/chat`
- modular chat engine
- provider abstraction
- lexical RAG over transcript chunks
- vocabulary guardrails
- deterministic router
- exact cache
- startup cache
- structured response fields
- prompt v2
- fallback reasons
- tests/evals in progress

### Current Main App Gap

The main React/Express app does not yet have:
- real chat UI
- Express gateway/proxy to ai-service
- conversation persistence
- chat history
- chat auth enforcement
- chat rate limiting
- integrated E2E tests

Therefore, the next phase is product integration, not AI-brain rebuilding.

---

## 3. Target Architecture

```txt
React Frontend
   |
   | POST /api/chat
   v
Express Backend Gateway
   |
   | authenticated request
   | validation
   | rate limit
   | persistence
   v
FastAPI AI Service
   |
   | router/cache/retrieval/provider/guardrails
   v
LLM Provider
```

Persistence path:

```txt
Express Backend
   |
   v
Firestore Admin SDK
   |
   v
chatConversations/{conversationId}
chatConversations/{conversationId}/messages/{messageId}
```

Important:
- frontend must never call `ai-service` directly.
- frontend must never know provider API keys.
- chat writes must go through Express backend.
- AI service can remain internal or require a shared secret if reachable.

---

## 4. User Flow

### New Chat

1. Student logs in.
2. Student opens `/chatbot`.
3. Frontend loads empty chat state.
4. Student writes a Hebrew question.
5. Frontend sends request to `POST /api/chat`.
6. Backend authenticates user.
7. Backend creates conversation if no `conversationId`.
8. Backend saves user message.
9. Backend calls FastAPI ai-service.
10. Backend saves assistant response.
11. Frontend renders answer.
12. Student can continue the conversation.

### Existing Chat

1. Student opens `/chatbot`.
2. Frontend loads previous conversations.
3. Student selects a conversation.
4. Frontend loads messages.
5. Student sends another message.
6. Backend verifies ownership and appends messages.

---

## 5. API Contract

### Frontend → Express Backend

`POST /api/chat`

Request:

```json
{
  "message": "איך קוראים לך?",
  "conversationId": "optional-string",
  "level": "A1",
  "includeArabic": false,
  "clientMessageId": "optional-client-generated-id"
}
```

Successful Response:

```json
{
  "conversationId": "string",
  "messageId": "assistant-message-id",
  "answerHe": "שלום!",
  "answerAr": null,
  "fallbackUsed": false,
  "fallbackReason": null,
  "level": "A1",
  "latencyMs": 120,
  "cacheHit": false,
  "routerHit": true,
  "suggestedNextPrompts": [
    "מה השם שלך?",
    "איך אומרים תודה?"
  ]
}
```

Error-like Safe Response:

```json
{
  "conversationId": "string-or-null",
  "messageId": "string-or-null",
  "answerHe": "נסה שוב עם שאלה קצרה.",
  "answerAr": null,
  "fallbackUsed": true,
  "fallbackReason": "SERVICE_UNAVAILABLE",
  "level": "A1",
  "latencyMs": 0,
  "cacheHit": false,
  "routerHit": false,
  "suggestedNextPrompts": []
}
```

### Express Backend → FastAPI AI Service

`POST {AI_SERVICE_URL}/api/ai/chat`

Request:

```json
{
  "message": "איך קוראים לך?",
  "level": "A1",
  "includeArabic": false
}
```

Expected Response:

```json
{
  "answerHe": "שלום!",
  "answerAr": null,
  "fallbackUsed": false,
  "fallbackReason": null,
  "level": "A1",
  "model": "gemini-2.5-flash-lite",
  "latencyMs": 0,
  "cacheHit": false,
  "routerHit": true,
  "contextChunkIds": [],
  "guardrail": {
    "vocabularyLeakage": false,
    "blockedTokens": []
  }
}
```

---

## 5.1 Environment Variables

The MVP integration contract depends on these variables:

### Express Backend

- `AI_SERVICE_URL`
  Base URL for the internal FastAPI service, for example `http://127.0.0.1:8000`.
- `AI_SERVICE_TIMEOUT_MS`
  Timeout for the backend request to the AI service.
- `CHAT_RATE_LIMIT_WINDOW_MS`
  Rate limit window for `POST /api/chat`.
- `CHAT_RATE_LIMIT_MAX`
  Maximum chat requests allowed inside the rate limit window.

### FastAPI AI Service

- `LLM_PROVIDER`
  Provider selector for the existing AI engine.
- `LLM_MODEL`
  Model selector for the existing AI engine.
- `CHAT_PROVIDER_TIMEOUT_SECONDS`
  Provider SDK timeout.
- `CHAT_PROVIDER_HARD_TIMEOUT_SECONDS`
  Hard timeout wrapper around provider calls.

Important:
- React must not read provider secrets.
- React must not call `AI_SERVICE_URL` directly.
- Express is the only frontend entrypoint for chat traffic.

---

## 6. Firestore Schema

### Collection: `chatConversations`

```txt
chatConversations/{conversationId}
  userId: string
  level: string
  title: string
  createdAt: timestamp
  updatedAt: timestamp
  lastMessageAt: timestamp
  lastMessagePreview: string
  messageCount: number
  deletedAt: timestamp | null
```

### Subcollection: `messages`

```txt
chatConversations/{conversationId}/messages/{messageId}
  userId: string
  role: "user" | "assistant"
  textHe: string | null
  textAr: string | null
  rawText: string | null
  fallbackUsed: boolean | null
  fallbackReason: string | null
  cacheHit: boolean | null
  routerHit: boolean | null
  latencyMs: number | null
  createdAt: timestamp
  clientMessageId: string | null
```

### Storage Rules

Do store:
- final answer
- fallback status
- latency
- cache/router flags
- minimal message text

Do not store:
- full system prompt
- API keys
- raw provider stack traces
- full retrieved chunk bodies
- sensitive internal debug data

---

## 7. Auth and Security Requirements

### Authentication

All `/api/chat*` routes require authenticated user.

Expected behavior:
- missing token → `401`
- invalid token → `401`
- valid token → request continues

### Ownership

Every conversation belongs to exactly one `userId`.

Required checks:
- create conversation under authenticated user.
- list only conversations for authenticated user.
- fetch only if `conversation.userId === req.user.uid`.
- append only if owner.
- delete only if owner.

### Rate Limiting

`POST /api/chat` must be rate limited.

Recommended initial policy:
- classroom-friendly limit.
- not too strict for demo.
- configurable through env.

Example:
- 20 messages per minute per user/IP for MVP.
- lower/higher can be adjusted.

### AI Service Boundary

Preferred:
- ai-service is not publicly reachable.

If reachable:
- require shared secret header from backend.
- reject calls without valid secret.

---

## 8. Performance Requirements

### User Experience Targets

- deterministic/router/cache response should feel instant.
- normal response should usually feel under a few seconds.
- UI must remain responsive during requests.
- no duplicate sends.
- no infinite loading.

### Technical Targets

For AI service:
- vocabulary leakage: `0%`
- provider crash: `0%`
- empty response: `0%`
- cache hit latency: `< 100ms`
- deterministic routing: at least `20-30%` for common inputs where possible

For integrated app:
- backend gateway overhead should be small.
- persistence should not noticeably slow cached/router responses.
- timeout should protect UX from hanging provider calls.

---

## 9. Chat UI Requirements

### Required Components

- Chatbot page
- Message list
- User message bubble
- Assistant message bubble
- Composer input
- Send button
- Loading/typing indicator
- Empty state
- Conversation list/history
- New chat action
- Error/fallback display

### RTL/LTR

Because the app uses Arabic and Hebrew:
- layout must support RTL.
- Hebrew answers must display cleanly.
- Arabic explanations must display cleanly.
- mixed text should not break alignment.

### Accessibility

Minimum:
- send button has accessible label.
- input is focusable.
- loading state is visible.
- error state is readable.

---

## 10. AI Behavior Requirements

### Scope

The chatbot should answer:
- beginner Hebrew questions.
- A1-level practice.
- simple vocabulary/phrases.
- simple Arabic explanation only when requested.

The chatbot should fallback for:
- empty messages.
- unsupported language.
- too long messages.
- out-of-scope questions.
- vocabulary leakage.
- provider timeout/error.
- unsafe or irrelevant content.

### Multi-turn Memory

MVP decision:
- conversation history is for UI only.
- do not inject previous messages into model context yet.

Reason:
- current cache, guardrails, retrieval, and leakage checks are designed for single-turn messages.
- adding memory changes correctness and latency.

Future option:
- last N messages after dedicated evals and cache-key changes.

---

## 11. Suggested Next Prompts

MVP can generate suggestions deterministically.

Examples:
- `מה השם שלך?`
- `איך אומרים תודה?`
- `אני רוצה לתרגל משפט קצר.`
- `אפשר הסבר בערבית?`

Do not call LLM only to generate suggestions in MVP.

---

## 12. Error and Fallback Policy

The user should not see technical errors.

Bad:
```txt
500 Internal Server Error
ProviderError: quota exceeded
```

Good:
```txt
נסה שוב עם שאלה קצרה.
```

Backend may include internal reason fields for debugging:
- `SERVICE_UNAVAILABLE`
- `MODEL_TIMEOUT`
- `MODEL_ERROR`
- `EMPTY_MESSAGE`
- `MESSAGE_TOO_LONG`
- `OUT_OF_SCOPE`

Frontend should display them only in dev mode if useful.

---

## 13. Testing Requirements

### AI Service

Must test:
- valid A1 question
- fallback reasons
- vocabulary leakage
- Arabic explanation behavior
- cache/router behavior
- provider timeout
- provider error
- benchmark/eval dataset

### Backend

Must test:
- auth required
- valid gateway call
- invalid payload
- timeout handling
- Firestore conversation create
- message append
- owner checks
- rate limiting

### Frontend

Must test manually or automatically:
- send message
- loading state
- fallback state
- history reload
- new chat
- mobile layout
- Arabic/Hebrew display

### E2E

Minimum smoke:
1. login
2. open chatbot
3. send Hebrew A1 question
4. receive answer
5. refresh
6. see saved history
7. send out-of-scope message
8. see fallback

---

## 14. Non-Goals Before MVP

Do not implement before the integrated chatbot is working:
- semantic embeddings
- vector DB
- agent loop
- tool use
- admin dashboard
- model comparison
- fine-tuning
- full multi-turn model memory
- complex analytics

---

## 15. Definition of MVP Done

The chatbot MVP is done when:

- student can access chatbot from main app.
- user must be authenticated.
- message is sent through Express backend.
- backend calls FastAPI AI service.
- response appears in UI.
- conversation is saved in Firestore.
- student can reopen previous conversations.
- fallback works without crashes.
- rate limiting exists.
- basic QA report exists.
- docs explain startup, architecture, API, and limitations.

---

## 16. Final Engineering Verdict

The AI engine is credible enough to integrate.

The product is not ready until:
- gateway exists.
- persistence exists.
- UI exists.
- auth/ownership are enforced.
- integrated QA passes.

The fastest path to a stronger project is not more AI experimentation. It is turning the existing AI service into a secure, persistent, student-facing chatbot experience.
