# Lisan Backend API Documentation

## Endpoints

| Endpoint | Method | Purpose | Auth Required | Status |
|---|---|---|---|---|
| `/api/health` | GET | Server health check | No | ✅ |
| `/api/auth/login` | POST | User login (mock) | No | ✅ |
| `/api/users/me` | GET | Get current user profile (mock) | Yes | ✅ |

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