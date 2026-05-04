# Lisan Backend API Documentation

## Base URL
http://localhost:3000/api

---

## Endpoints

| Endpoint | Method | Purpose | Auth Required | Status |
|---|---|---|---|---|
| `/api/health` | GET | Server health check | No | ✅ |
| `/api/auth/login` | POST | User login | No | ✅ |
| `/api/users/me` | GET | Get current user profile | Yes | ✅ |

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
```
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

## Example cURL Commands

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