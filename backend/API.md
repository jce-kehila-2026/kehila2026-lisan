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
| `/api/evaluation/context` | GET | Get evaluation context for speaking assessment | No | ✅ |
| `/api/evaluation/attempts` | POST | Save student speaking attempt and AI evaluation | No | ✅ |

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
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
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
  "level": "beginner"
}
```

### Error Responses

#### 401 - No or invalid token

```json
{
  "error": "No token provided"
}
```

or

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

## 4. Get Evaluation Context

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

## 5. Save Student Attempt

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