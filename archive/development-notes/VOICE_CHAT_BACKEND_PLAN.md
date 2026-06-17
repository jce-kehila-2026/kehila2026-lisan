# Voice Chat Backend Plan

This file captures the agreed backend implementation plan for the voice-chat gateway.
Scope is limited to `backend/` unless a task explicitly requires a contract change with the AI service.

## Goal

Add a secure Express-to-FastAPI voice gateway that:

- accepts authenticated student audio uploads
- validates file size and MIME type
- forwards audio securely to the AI service
- persists chat history and audio metadata in Firestore/Storage
- rate-limits voice requests
- is covered by backend integration tests

## Current Backend Reality

- Existing route file is `src/routes/chats.js`, not `src/routes/chat.js`
- Existing controller file is `src/controllers/chatController.js`
- There is no `chatPersistenceService.js` yet
- There is no `multer` setup yet
- There are no backend integration tests yet

## Execution Plan

### 1. File Upload Handling

- Install and configure `multer`
- Use `memoryStorage()`
- Enforce a safe upload size limit for voice files
- Reuse this upload middleware only for the voice endpoint

Target files:

- `backend/package.json`
- `backend/src/routes/chats.js`
- `backend/src/middleware/` if a dedicated upload middleware file is needed

### 2. Voice Gateway Route

- Add `POST /api/chat/voice` as the target contract
- Decide whether to:
  - add a new `chat` router, or
  - keep the current `chats` router and expose a compatibility path
- Protect the endpoint with `requireAuth`

Target files:

- `backend/src/server.js`
- `backend/src/routes/chats.js`

### 3. Voice Controller

- Create a controller action to receive the audio file
- Validate:
  - presence of file
  - allowed MIME types: WAV, MP3, WebM
  - file size
- Parse optional fields such as:
  - `conversationId`
  - `level`
  - `includeArabic`

Target files:

- `backend/src/controllers/chatController.js`

### 4. Secure Service-to-Service Call

- Forward requests from Express to FastAPI only from the backend
- Always attach `X-Internal-Service-Secret` when configured
- Preserve timeout handling and safe error mapping

Target files:

- `backend/src/controllers/chatController.js`
- optional helper: `backend/src/services/aiChatService.js`

### 5. Forward Audio to AI Service

- Send in-memory audio buffer to `http://localhost:8000/api/ai/chat/voice`
- Use `axios` or native `fetch` with `FormData`
- Forward:
  - audio file
  - `level`
  - `includeArabic`
- Include internal secret header

Target files:

- `backend/src/controllers/chatController.js`
- optional helper: `backend/src/services/aiChatService.js`

### 6. Persist Audio in Cloud Storage

- Create `chatPersistenceService.js`
- Upload original student audio to Firebase Storage
- Return `audioUrl`
- Keep upload path deterministic and grouped by user/chat/date

Target files:

- `backend/src/services/chatPersistenceService.js`
- `backend/src/config/firebase.js` if storage helpers are missing

### 7. Extend Firestore Chat Schema

- Update chat persistence to store, per message when relevant:
  - `audioUrl`
  - `transcribedText`
  - `fallbackReason`
  - AI response text
- Keep failed voice attempts in history as explicit records

Suggested message fields:

- `sender`
- `text`
- `audioUrl`
- `transcribedText`
- `fallbackUsed`
- `fallbackReason`
- `createdAt`

Target files:

- `backend/src/controllers/chatController.js`
- `backend/src/services/chatPersistenceService.js`

### 8. Safe AI Error Handling

- Handle FastAPI failures without crashing the backend
- Map known failures such as:
  - STT failure
  - timeout
  - bad response
  - service unavailable
- Save failed attempts in chat history with fallback metadata

Target files:

- `backend/src/controllers/chatController.js`
- optional helper: `backend/src/services/aiChatService.js`

### 9. Voice-Specific Rate Limiting

- Add a dedicated limiter for the voice route
- Limit the number of uploaded audio files per user per minute
- Return a clear 429 response

Target files:

- `backend/src/server.js` or a dedicated middleware file
- `backend/src/routes/chats.js`

### 10. Integration Tests

- Add backend integration tests with `supertest`
- Cover:
  - authenticated upload success
  - missing file
  - invalid MIME type
  - oversized file
  - AI-service failure
  - Firestore persistence shape
  - rate limit behavior

Target files:

- `backend/tests/`
- `backend/package.json`

## Recommended Implementation Order

1. Add dependencies and upload middleware
2. Add the voice route and controller stub
3. Add service-to-service forwarding
4. Add persistence service for audio and Firestore schema updates
5. Add safe error mapping
6. Add voice-specific rate limiting
7. Add integration tests

## Important Notes Before Coding

- The frontend has newer code that expects `/api/chat/...`, while the backend currently serves `/api/chats/...`
- Before implementation, we should choose whether to:
  - align backend to `/api/chat`
  - or add compatibility routes and migrate gradually
- The AI service already exposes `/api/ai/chat/voice`, so backend work should treat FastAPI as the downstream voice engine

## Ownership

This file records the Codex backend voice-gateway plan requested on 2026-05-28.
