# Lisan Backend API Documentation

## Base URL

```text
http://localhost:3000/api
```

---

## Endpoints

| Endpoint | Method | Purpose | Auth Required | Status |
|---|---|---|---|---|
| `/api/health` | GET | Server health check | No | ✅ |
| `/api/auth/login` | POST | User login | No | ✅ |
| `/api/users/me` | GET | Get current user profile | Yes | ✅ |
| `/api/admin/users` | GET | Get all users | Admin | ✅ |
| `/api/admin/users` | POST | Create new user | Admin | ✅ |
| `/api/admin/users/:id` | PUT | Update user | Admin | ✅ |
| `/api/admin/users/:id` | DELETE | Delete user | Admin | ✅ |
| `/api/transcripts` | GET | Get all transcripts | No | ✅ |
| `/api/transcripts/level/:level` | GET | Get transcripts by level | No | ✅ |
| `/api/transcripts/search?q=&level=` | GET | Search transcripts | No | ✅ |
| `/api/evaluation/context` | GET | Get evaluation context | No | ✅ |
| `/api/evaluation/attempts` | POST | Save student attempt | No | ✅ |
| `/api/chats` | POST | Create chat session | Yes | ✅ |
| `/api/chats/my` | GET | Get my chat sessions | Yes | ✅ |
| `/api/chats/:chatId` | GET | Get chat by ID | Yes | ✅ |
| `/api/chats/:chatId/messages` | POST | Add message to chat | Yes | ✅ |
| `/api/progress/me` | GET | Get my progress | Yes | ✅ |
| `/api/progress/me/attempts` | GET | Get my attempts | Yes | ✅ |

---

## 1. Health Check

**GET** `/api/health`

### Response

```json
{
  "status": "ok",
  "timestamp": "2026-04-23T12:00:00Z",
  "version": "1.0.0"
}
```

---

## 2. Login

**POST** `/api/auth/login`

### Request Body

```json
{
  "email": "student@test.com",
  "password": "Test1234!"
}
```

### Success Response (200)

```json
{
  "token": "jwt-token-here",
  "user": {
    "id": "abc123",
    "name": "Test User",
    "role": "student",
    "language": "ar"
  }
}
```

### Error Responses

#### 400 - Missing fields

```json
{
  "error": "Email and password are required"
}
```

#### 401 - Invalid credentials

```json
{
  "error": "Invalid credentials"
}
```

#### 423 - Account locked

```json
{
  "error": "Account is locked",
  "unlockAt": "2026-05-04T18:00:00Z"
}
```

---

## 3. Get Current User

**GET** `/api/users/me`

### Headers

```text
Authorization: Bearer <token>
```

### Success Response (200)

```json
{
  "id": "abc123",
  "name": "Test User",
  "email": "student@test.com",
  "role": "student",
  "language": "ar",
  "level": "A1"
}
```

### Error Responses

#### 401 - No or invalid token

```json
{
  "error": "No token provided"
}
```

```json
{
  "error": "Invalid or expired token"
}
```

#### 404 - User not found

```json
{
  "error": "User not found"
}
```

---

## 4. Admin Users

Admin endpoints require a valid JWT token with role `admin`.

### 4.1 Get All Users

**GET** `/api/admin/users`

### Headers

```text
Authorization: Bearer <admin-token>
```

### Success Response (200)

```json
{
  "success": true,
  "users": [
    {
      "id": "abc123",
      "email": "student@test.com",
      "name": "Test Student",
      "role": "student",
      "level": "A1",
      "language": "ar",
      "isActive": true,
      "createdAt": null,
      "lastLoginAt": null
    }
  ]
}
```

---

### 4.2 Create User

**POST** `/api/admin/users`

### Headers

```text
Authorization: Bearer <admin-token>
```

### Request Body

```json
{
  "email": "newstudent@test.com",
  "password": "Test1234!",
  "name": "New Student",
  "role": "student",
  "level": "A1",
  "language": "ar"
}
```

### Success Response (201)

```json
{
  "success": true,
  "user": {
    "id": "abc123",
    "email": "newstudent@test.com",
    "name": "New Student",
    "role": "student",
    "level": "A1",
    "language": "ar",
    "isActive": true
  }
}
```

### Error Responses

```json
{
  "success": false,
  "error": "User already exists",
  "code": "USER_ALREADY_EXISTS"
}
```

---

### 4.3 Update User

**PUT** `/api/admin/users/:id`

### Headers

```text
Authorization: Bearer <admin-token>
```

### Request Body

```json
{
  "level": "A2",
  "language": "ar",
  "isActive": true
}
```

### Success Response (200)

```json
{
  "success": true,
  "message": "User updated successfully"
}
```

---

### 4.4 Delete User

**DELETE** `/api/admin/users/:id`

### Headers

```text
Authorization: Bearer <admin-token>
```

### Success Response (200)

```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

---

## 5. Transcripts

### 5.1 Get All Transcripts

**GET** `/api/transcripts`

### Success Response (200)

```json
[
  {
    "id": "abc123",
    "level": "A1",
    "fileName": "Copy of 1. מי אני.txt",
    "text": "Hebrew transcript text...",
    "language": "he",
    "source": "lisan_curriculum"
  }
]
```

---

### 5.2 Get Transcripts By Level

**GET** `/api/transcripts/level/:level`

Example:

```text
GET /api/transcripts/level/A1
```

### Success Response (200)

```json
[
  {
    "id": "abc123",
    "level": "A1",
    "fileName": "Copy of 1. מי אני.txt",
    "text": "Hebrew transcript text..."
  }
]
```

---

### 5.3 Search Transcripts

**GET** `/api/transcripts/search?q=ירושלים`

Optional level filter:

```text
GET /api/transcripts/search?q=ירושלים&level=A1
```

### Success Response (200)

```json
{
  "query": "ירושלים",
  "level": "A1",
  "count": 2,
  "results": [
    {
      "id": "abc123",
      "level": "A1",
      "fileName": "example.txt",
      "text": "..."
    }
  ]
}
```

---

## 6. Evaluation Context

**GET** `/api/evaluation/context`

### Purpose

Returns a normalized evaluation context for the AI speaking assessment model based on `userId`, `activityId`, and optional `turnId`.

### Query Parameters

| Parameter | Required | Description |
|---|---|---|
| `userId` | Yes | Student user ID |
| `activityId` | Yes | Activity ID |
| `turnId` | No | Specific dialogue turn ID |

### Example Request

```text
GET /api/evaluation/context?userId=test_user&activityId=a1_booking_appointment&turnId=turn_01
```

### Success Response (200)

```json
{
  "success": true,
  "context": {
    "userId": "test_user",
    "activityId": "a1_booking_appointment",
    "turnId": "turn_01",
    "level": "A1",
    "skill": "speaking",
    "activity": {
      "title": "קביעת תור",
      "topic": "booking an appointment",
      "activityMode": "guided_conversation",
      "analysisDepth": "meaning_only",
      "targetVocabulary": ["לקבוע תור", "תעודת זהות", "שעה"],
      "targetGrammar": ["אני רוצה", "אפשר"],
      "expectedPatterns": [
        "אני רוצה לקבוע תור",
        "אפשר לקבוע תור?"
      ],
      "referenceText": "אני רוצה לקבוע תור",
      "strictness": "low",
      "maxFeedbackItems": 1,
      "feedbackLanguage": "he",
      "supportLanguage": "ar",
      "allowAdvancedCorrectLanguage": true,
      "simplifyAdvancedLanguage": true
    },
    "currentTurn": {
      "botTextHe": "שלום, איך אפשר לעזור?",
      "expectedStudentAction": "ask_to_book_appointment",
      "expectedPatterns": [
        "אני רוצה לקבוע תור",
        "אפשר לקבוע תור?"
      ],
      "referenceText": "אני רוצה לקבוע תור"
    },
    "rubric": {
      "expectedMeaning": "הסטודנט צריך לבקש לקבוע תור.",
      "requiredElements": ["request_appointment"],
      "acceptablePatterns": [
        "אני רוצה לקבוע תור",
        "אפשר לקבוע תור?",
        "ברצוני לקבוע פגישה"
      ],
      "commonMistakes": [
        {
          "wrong": "לעשות תור",
          "correct": "לקבוע תור",
          "type": "vocabulary",
          "explanationHeSimple": "בעברית אומרים לקבוע תור."
        }
      ],
      "correctionPolicy": {
        "maxCorrections": 1,
        "correctOnlyLevelRelevant": true,
        "ignoreAdvancedStylisticIssues": true,
        "doNotPunishAdvancedCorrectHebrew": true
      }
    },
    "limits": {
      "remainingPronunciationChecks": 20,
      "monthlyPronunciationLimit": 30
    }
  }
}
```

### Error Responses

#### 400 - Missing query parameters

```json
{
  "success": false,
  "error": "userId and activityId are required",
  "code": "MISSING_REQUIRED_PARAMS"
}
```

#### 404 - Context not found

```json
{
  "success": false,
  "error": "Activity not found",
  "code": "ACTIVITY_NOT_FOUND"
}
```

---

## 7. Save Student Attempt

**POST** `/api/evaluation/attempts`

### Purpose

Saves a student speaking attempt after STT recognition and AI evaluation.

### Request Body

```json
{
  "userId": "test_user",
  "activityId": "a1_booking_appointment",
  "turnId": "turn_01",
  "recognizedTextHe": "אני רוצה לקבוע תור",
  "aiEvaluation": {
    "feedbackHe": "יפה מאוד",
    "isMeaningCorrect": true
  },
  "usage": {
    "level": "A1",
    "referenceText": "אני רוצה לקבוע תור",
    "usedAzurePronunciation": false,
    "costMode": "standard"
  }
}
```

### Success Response (201)

```json
{
  "success": true,
  "attempt": {
    "id": "YgRiLFYHMpE0FIVd54ur",
    "userId": "test_user",
    "activityId": "a1_booking_appointment",
    "turnId": "turn_01",
    "level": "A1",
    "recognizedTextHe": "אני רוצה לקבוע תור",
    "referenceText": "אני רוצה לקבוע תור",
    "aiEvaluation": {
      "feedbackHe": "יפה מאוד",
      "isMeaningCorrect": true
    },
    "usedAzurePronunciation": false,
    "costMode": "standard",
    "createdAt": "2026-05-16T16:59:41.431Z"
  }
}
```

### Error Responses

#### 400 - Missing required fields

```json
{
  "success": false,
  "error": "userId, activityId, and recognizedTextHe are required",
  "code": "MISSING_REQUIRED_FIELDS"
}
```

#### 500 - Server error

```json
{
  "success": false,
  "error": "Server error",
  "code": "SERVER_ERROR"
}
```

---

## 8. Chat History

All chat endpoints require a valid JWT token.

### 8.1 Create Chat

**POST** `/api/chats`

### Headers

```text
Authorization: Bearer <token>
```

### Request Body

```json
{
  "title": "Restaurant Practice",
  "level": "A1"
}
```

### Success Response (201)

```json
{
  "success": true,
  "chat": {
    "id": "chat123",
    "userId": "user123",
    "title": "Restaurant Practice",
    "level": "A1",
    "messages": []
  }
}
```

---

### 8.2 Get My Chats

**GET** `/api/chats/my`

### Headers

```text
Authorization: Bearer <token>
```

### Success Response (200)

```json
{
  "success": true,
  "chats": [
    {
      "id": "chat123",
      "userId": "user123",
      "title": "Restaurant Practice",
      "level": "A1",
      "messagesCount": 2
    }
  ]
}
```

---

### 8.3 Get Chat By ID

**GET** `/api/chats/:chatId`

### Headers

```text
Authorization: Bearer <token>
```

### Success Response (200)

```json
{
  "success": true,
  "chat": {
    "id": "chat123",
    "userId": "user123",
    "title": "Restaurant Practice",
    "level": "A1",
    "messages": [
      {
        "sender": "user",
        "text": "אני רוצה מים",
        "createdAt": "2026-05-22T07:17:58.918Z"
      },
      {
        "sender": "ai",
        "text": "יפה מאוד. אפשר גם להגיד: אני רוצה כוס מים.",
        "createdAt": "2026-05-22T07:18:13.743Z"
      }
    ]
  }
}
```

---

### 8.4 Add Message To Chat

**POST** `/api/chats/:chatId/messages`

### Headers

```text
Authorization: Bearer <token>
```

### Request Body

```json
{
  "sender": "user",
  "text": "שלום"
}
```

Allowed senders:

```text
user
ai
```

### Success Response (201)

```json
{
  "success": true,
  "message": {
    "sender": "user",
    "text": "שלום",
    "createdAt": "2026-05-22T07:05:42.914Z"
  }
}
```

---

## 9. Student Progress

All progress endpoints require a valid JWT token.

### 9.1 Get My Progress

**GET** `/api/progress/me`

### Headers

```text
Authorization: Bearer <token>
```

### Success Response (200)

```json
{
  "success": true,
  "progress": {
    "userId": "user123",
    "name": "Test student",
    "role": "student",
    "level": "A2",
    "totalAttempts": 0,
    "correctMeaningCount": 0,
    "totalChats": 3,
    "pronunciationUsage": {
      "monthlyLimit": 30,
      "usedThisMonth": 0
    },
    "accuracy": 0
  }
}
```

---

### 9.2 Get My Attempts

**GET** `/api/progress/me/attempts`

### Headers

```text
Authorization: Bearer <token>
```

### Success Response (200)

```json
{
  "success": true,
  "count": 0,
  "attempts": []
}
```

---

## Example cURL Commands

### Health Check

```bash
curl http://localhost:3000/api/health
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
-H "Content-Type: application/json" \
-d '{"email":"student@test.com","password":"Test1234!"}'
```

### Get Current User

```bash
curl http://localhost:3000/api/users/me \
-H "Authorization: Bearer <token>"
```

### Get All Users Admin

```bash
curl http://localhost:3000/api/admin/users \
-H "Authorization: Bearer <admin-token>"
```

### Create Chat

```bash
curl -X POST http://localhost:3000/api/chats \
-H "Authorization: Bearer <token>" \
-H "Content-Type: application/json" \
-d '{"title":"Restaurant Practice","level":"A1"}'
```

### Add Chat Message

```bash
curl -X POST http://localhost:3000/api/chats/<chatId>/messages \
-H "Authorization: Bearer <token>" \
-H "Content-Type: application/json" \
-d '{"sender":"user","text":"שלום"}'
```

### Get Progress

```bash
curl http://localhost:3000/api/progress/me \
-H "Authorization: Bearer <token>"
```

### Get Evaluation Context

```bash
curl "http://localhost:3000/api/evaluation/context?userId=test_user&activityId=a1_booking_appointment&turnId=turn_01"
```

### Save Student Attempt

```bash
curl -X POST http://localhost:3000/api/evaluation/attempts \
-H "Content-Type: application/json" \
-d '{
  "userId": "test_user",
  "activityId": "a1_booking_appointment",
  "turnId": "turn_01",
  "recognizedTextHe": "אני רוצה לקבוע תור",
  "aiEvaluation": {
    "feedbackHe": "יפה מאוד",
    "isMeaningCorrect": true
  },
  "usage": {
    "level": "A1",
    "referenceText": "אני רוצה לקבוע תור",
    "usedAzurePronunciation": false,
    "costMode": "standard"
  }
}'
```