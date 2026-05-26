# Lisan Chat API Contract
**Version:** 1.0  
**Last updated:** 2026-05-26  
**Owner:** Backend Team

---

## Overview

The React frontend communicates **only** with the Express backend.  
The FastAPI AI service URL is **never exposed** to the client.

```
[React Frontend]  →  POST /api/chat  →  [Express Gateway]  →  POST /api/ai/chat  →  [FastAPI AI Service]
```

---

## Endpoint

```
POST /api/chat
```

**Auth:** Required — `Authorization: Bearer <JWT>`  
**Content-Type:** `application/json`

---

## Request

```json
{
  "message":       "מה שלומך?",
  "level":         "A1",
  "includeArabic": false
}
```

| Field           | Type    | Required | Constraints              | Description                          |
|-----------------|---------|----------|--------------------------|--------------------------------------|
| `message`       | string  | ✅       | 1–1000 chars             | The user's chat message              |
| `level`         | string  | ✅       | `A1`\|`A2`\|`B1`\|`B2`\|`C1`\|`C2` | CEFR proficiency level |
| `includeArabic` | boolean | ❌       | default: `false`         | Request Arabic translation alongside Hebrew |

---

## Response — 200 OK

```json
{
  "answerHe":            "שלום! אני בסדר, תודה. מה שלומך?",
  "answerAr":            null,
  "fallbackUsed":        false,
  "fallbackReason":      null,
  "level":               "A1",
  "model":               "gemini-1.5-flash",
  "latencyMs":           412,
  "contextChunkIds":     ["chunk-001", "chunk-042"],
  "suggestedNextPrompts":["אני בסדר גם", "מה נעשה היום?"],
  "guardrail": {
    "flagged":   false,
    "category":  null,
    "details":   {}
  }
}
```

| Field                  | Type           | Nullable | Description                                         |
|------------------------|----------------|----------|-----------------------------------------------------|
| `answerHe`             | string         | ❌       | Primary Hebrew AI response                          |
| `answerAr`             | string \| null | ✅       | Arabic response (only when `includeArabic: true`)   |
| `fallbackUsed`         | boolean        | ❌       | `true` if a cached/static fallback was used         |
| `fallbackReason`       | string \| null | ✅       | Reason for fallback (e.g. `"ai_timeout"`)           |
| `level`                | string         | ❌       | Resolved CEFR level used to generate the response  |
| `model`                | string         | ❌       | Model identifier (e.g. `"gemini-1.5-flash"`)        |
| `latencyMs`            | number         | ❌       | End-to-end AI processing time in milliseconds       |
| `contextChunkIds`      | string[]       | ❌       | RAG context chunk IDs used (empty array if none)    |
| `suggestedNextPrompts` | string[]       | ❌       | Follow-up prompt suggestions for the UI             |
| `guardrail.flagged`    | boolean        | ❌       | Whether the message violated content policy         |
| `guardrail.category`   | string \| null | ✅       | Violation category if flagged                       |
| `guardrail.details`    | object         | ❌       | Extra guardrail metadata                            |

---

## Error Responses

| Status | Code                   | When                                             |
|--------|------------------------|--------------------------------------------------|
| `400`  | `VALIDATION_ERROR`     | Missing/invalid fields in request body           |
| `401`  | `UNAUTHORIZED`         | Missing or invalid JWT token                     |
| `408`  | `AI_TIMEOUT`           | AI service did not respond within 6 seconds      |
| `422`  | `INVALID_LEVEL`        | `level` value not in CEFR set                    |
| `503`  | `AI_SERVICE_ERROR`     | FastAPI returned a non-2xx response              |
| `500`  | `INTERNAL_ERROR`       | Unexpected server-side error                     |

### Error body shape (all errors)

```json
{
  "success": false,
  "code":    "AI_TIMEOUT",
  "error":   "AI service did not respond in time. Please try again."
}
```

---

## Notes

- The FastAPI service URL (`AI_SERVICE_URL`) and the shared secret (`INTERNAL_API_SECRET`) are **environment variables** on the Express server — never sent to or readable by the client.
- `latencyMs` reflects AI engine time only, not the full Express round-trip.
- `guardrail.flagged: true` does **not** block the response by default — the frontend decides how to display flagged messages.
