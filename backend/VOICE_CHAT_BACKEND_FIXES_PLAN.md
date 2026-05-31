# Codex Backend Fixes Plan

This file captures the follow-up backend stabilization plan for the voice/chat gateway.
Scope remains limited to `backend/` only. No frontend changes are included in this plan.

## Role

- Backend engineer
- Stack: Node.js, Express.js, Firebase, Axios, Multer, Supertest

## Goal

Fix the gaps discovered during review of the 10 voice-gateway tasks:

- correct AI-service URL construction
- separate text and voice timeout handling
- move MIME filtering fully into Multer
- improve Multer error handling
- complete missing integration coverage
- add startup env validation warnings

## Tasks

### Task 1. Fix Text Chat API URL Construction

- File: `backend/src/services/aiChatService.js`
- Update text-chat request building so it targets:
  - `${AI_SERVICE_URL}/api/ai/chat`
- Do not send text chat requests to the AI-service root URL

### Task 2. Fix Voice Chat API URL Construction

- File: `backend/src/services/aiChatService.js`
- Update voice-chat request building so it targets:
  - `${AI_SERVICE_URL}/api/ai/chat/voice`
- Do not append `/voice` to a root-only URL

### Task 3. Use Voice-Specific Timeout

- File: `backend/src/services/aiChatService.js`
- Read:
  - `AI_SERVICE_VOICE_TIMEOUT_MS`
- Default value:
  - `20000`
- Apply this timeout only inside `sendVoiceMessageToAi`
- Keep text timeout separate from voice timeout

### Task 4. Move MIME Filtering into Multer

- File: `backend/src/middleware/voiceUpload.js`
- Implement `fileFilter` using `file.mimetype`
- Allow only supported audio MIME types such as:
  - `audio/wav`
  - `audio/webm`
  - `audio/mpeg`
  - related accepted audio MIME aliases already used by the project
- Reject unsupported files before they are stored in memory

### Task 5. Remove Duplicate MIME Validation from Controller

- File: `backend/src/controllers/chatController.js`
- Remove manual MIME-type validation logic from the voice controller
- Keep only the controller validations that still belong there, such as:
  - presence of file
  - non-empty file
  - business validations not already enforced by Multer

### Task 6. Improve Multer Error Handling

- Files:
  - `backend/src/middleware/voiceUpload.js`
  - router/controller layer if needed
- Return clear JSON responses for:
  - oversized file
  - unsupported MIME type
  - malformed upload payload
- Avoid generic request crashes

### Task 7. Add Integration Test for AI Failure

- Folder: `backend/tests/`
- Add a `Supertest` integration test for `POST /api/chat/voice`
- Mock downstream AI failure such as:
  - timeout
  - HTTP 500
- Verify:
  - backend returns a controlled failure response
  - request does not crash the app
  - Firestore history still saves the fallback attempt

### Task 8. Add Integration Test for Oversized File

- Folder: `backend/tests/`
- Add a `Supertest` test that uploads an audio file larger than `10MB`
- Verify:
  - request is rejected immediately
  - response is `413` or controlled `400`
  - downstream AI/storage services are not called

### Task 9. Add Integration Test for Invalid MIME Type

- Folder: `backend/tests/`
- Add a `Supertest` test that uploads a `.txt` or `.png` file
- Verify:
  - Multer `fileFilter` rejects it
  - response is `400`
  - error explains that file type is unsupported

### Task 10. Add Startup Env Validation Warning

- File: `backend/src/server.js` or a backend config module
- On startup, warn clearly if these vars are missing:
  - `AI_SERVICE_URL`
  - `AI_SERVICE_VOICE_TIMEOUT_MS`
- This is a warning/logging task, not a hard crash requirement unless we later choose to enforce one

## Recommended Execution Order

1. Fix AI-service URL construction
2. Add voice-specific timeout
3. Move MIME filtering into Multer
4. Remove duplicated controller validation
5. Improve Multer error responses
6. Add the 3 missing integration tests
7. Add startup env validation warnings

## Notes

- This plan is a follow-up to `VOICE_CHAT_BACKEND_PLAN.md`
- It exists so we can implement the fixes incrementally without touching frontend code
- After these tasks, we should rerun backend tests and do one more backend-only review
