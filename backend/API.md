# Lisan Backend API Documentation

## Base URL

```txt
http://localhost:3000/api
```

---

## Authentication Header

Protected routes require:

```txt
Authorization: Bearer <token>
```

---

# 1. Health

## GET `/api/health`

Checks server status.

---

# 2. Authentication

## POST `/api/auth/login`

Login with email and password.

### Body

```json
{
  "email": "admin@test.com",
  "password": "Test1234!"
}
```

---

# 3. Users

## GET `/api/users/me`

Get current logged-in user.

Auth required.

---

# 4. Admin Users

Admin only.

## GET `/api/admin/users`

Get all users.

## POST `/api/admin/users`

Create user.

### Body

```json
{
  "email": "student@test.com",
  "password": "Test1234!",
  "name": "Student Name",
  "role": "student",
  "level": "A1",
  "language": "ar",
  "teacherIds": []
}
```

Allowed roles:

```txt
student
teacher
admin
```

## PUT `/api/admin/users/:id`

Update user.

## DELETE `/api/admin/users/:id`

Delete user.

---

# 5. Admin Audio Recordings

Admin only.

## POST `/api/admin/audio-recordings`

Create audio recording.

Content type:

```txt
multipart/form-data
```

Fields:

```txt
title
description
level
language
category
transcriptText
duration
tags
isActive
audioFile
jsonFile
```

Required:

```txt
title
level
language
category
transcriptText
audioFile
```

Allowed levels:

```txt
A1
A2
B1
B2
```

Allowed languages:

```txt
ar
he
en
```

## GET `/api/admin/audio-recordings`

Get all audio recordings.

Optional query filters:

```txt
level
language
category
isActive
```

Example:

```txt
/api/admin/audio-recordings?level=A1&language=he&isActive=true
```

## GET `/api/admin/audio-recordings/:id`

Get recording by ID.

## PUT `/api/admin/audio-recordings/:id`

Update recording.

Supports metadata update and optional new files.

## DELETE `/api/admin/audio-recordings/:id`

Delete recording and uploaded local files.

---

# 6. Admin Conversations Review

Admin only.

## GET `/api/admin/conversations`

Get AI conversations.

Supported filters:

```txt
studentId
teacherId
level
isArchived
from
to
search
page
limit
```

Example:

```txt
/api/admin/conversations?page=1&limit=5
```

Example with search:

```txt
/api/admin/conversations?page=1&limit=5&search=%D7%A9%D7%99%D7%97%D7%94
```

Example with level:

```txt
/api/admin/conversations?level=A1
```

Response includes:

```json
{
  "success": true,
  "conversations": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

## GET `/api/admin/conversations/:id`

Get full conversation by ID.

---

# 7. Admin Words Review

Admin only.

## GET `/api/admin/words/pending`

Get pending words.

## POST `/api/admin/words`

Create pending word.

### Body

```json
{
  "word": "shalom",
  "translation": "مرحبا",
  "level": "A1",
  "language": "he",
  "notes": "test word"
}
```

Validation:

```txt
level must be A1, A2, B1, or B2
language must be ar, he, or en
```

## PUT `/api/admin/words/:id/approve`

Approve pending word.

Moves word from:

```txt
pendingWords
```

to:

```txt
words
```

## PUT `/api/admin/words/:id/reject`

Reject pending word.

### Body

```json
{
  "notes": "not suitable"
}
```

---

# 8. Admin AI Tools

Admin only.

## GET `/api/admin/ai/analytics`

Proxy to AI service analytics.

## GET `/api/admin/ai/logs`

Get AI provider logs.

Optional filters:

```txt
provider
status
limit
```

## POST `/api/admin/ai/circuits/reset`

Reset AI voice circuit breaker.

---

# 9. Teacher APIs

Teacher only.

## GET `/api/teacher/students`

Get assigned students.

## GET `/api/teacher/students/:id/progress`

Get student progress.

## GET `/api/teacher/students/:id/attempts`

Get student attempts.

## GET `/api/teacher/students/:id/chats`

Get student chats.

---

# 10. AI Chats

Auth required.

## POST `/api/chats`

Create AI chat.

## GET `/api/chats/my`

Get my chats.

## GET `/api/chats/:chatId`

Get chat by ID.

## POST `/api/chats/:chatId/messages`

Add message manually.

## POST `/api/chats/:chatId/ai`

Send message to AI.

## POST `/api/chats/voice`

Send voice message to AI.

## PUT `/api/chats/:id/archive`

Archive chat.

## DELETE `/api/chats/:chatId`

Delete chat.

---

# 11. Shared Chats

Auth required.

## GET `/api/shared-chats/available-users`

Get users available for shared chat.

Rules:

* Teacher can chat with assigned students.
* Student can chat with assigned teachers.
* Student can chat with students in the same level.
* User cannot chat with self.

## POST `/api/shared-chats`

Create shared chat.

### Body

```json
{
  "participantIds": ["userId1"]
}
```

## GET `/api/shared-chats/my`

Get my shared chats.

Sorted by latest updated chat first.

## GET `/api/shared-chats/:id`

Get shared chat and messages.

Also clears current user's unread state.

## POST `/api/shared-chats/:id/messages`

Send shared chat message.

### Body

```json
{
  "text": "שלום"
}
```

Validation:

```txt
text is required
max length: 5000 characters
```

---

# 12. Notifications

Auth required.

## GET `/api/notifications/my`

Get my notifications.

## PUT `/api/notifications/:id/read`

Mark notification as read.

---

# 13. Transcripts

## GET `/api/transcripts`

Get transcripts.

## GET `/api/transcripts/level/:level`

Get transcripts by level.

## GET `/api/transcripts/search?q=&level=`

Search transcripts.

---

# 14. Evaluation

## GET `/api/evaluation/context`

Get evaluation context.

Query:

```txt
userId
activityId
turnId
```

## POST `/api/evaluation/attempts`

Save student attempt.

---

# 15. Progress

Auth required.

## GET `/api/progress/me`

Get my progress.

## GET `/api/progress/me/attempts`

Get my attempts.

---

# 16. Vocabulary Progress

Auth required.

## POST `/api/vocab/progress`

Save vocabulary progress.

## GET `/api/vocab/progress/:userId`

Get vocabulary progress.

---

# Error Format

Most backend errors follow:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Some shared chat routes return:

```json
{
  "error": "Error message"
}
```

---

# Common Status Codes

```txt
200 OK
201 Created
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
423 Locked
500 Server Error
```

---

# Final Backend Status

Completed:

* Admin audio recordings
* Admin conversations review
* Admin words review
* Teacher APIs
* Shared chats
* Notifications
* AI chats
* Voice chats
* User management
* Validation
* Security
* Firebase integration

Notes:

* Audio files currently use local storage under `backend/uploads`.
* Firebase Storage can be enabled later when billing/storage is configured.
* Production requires environment variables instead of local private key files.
