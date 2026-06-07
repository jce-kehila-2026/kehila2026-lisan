# Lisan Backend

Backend service for the Lisan project.

It includes authentication, user management, AI chat integration, shared chats, teacher APIs, admin review APIs, audio dataset management, notifications, and student progress tracking.

---

## Tech Stack

* Node.js
* Express
* Firebase Admin SDK
* Firestore
* JWT
* bcrypt
* CORS
* dotenv
* Morgan
* Multer
* Nodemon
* Gemini / AI Service integration

---

## Setup

### 1. Go to the backend folder

```bash
cd backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create `.env` file

Example:

```env
PORT=3000
JWT_SECRET=your-secret-here
JWT_EXPIRES_IN=24h
NODE_ENV=development

AI_SERVICE_URL=http://127.0.0.1:8000
AI_SERVICE_INTERNAL_SECRET=your-internal-secret
AI_SERVICE_VOICE_TIMEOUT_MS=120000

CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
```

For Firebase credentials, use one of the following:

```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

or locally:

```txt
backend/privateKey.json
```

---

## Firebase Setup

Place your Firebase service account key here for local development:

```txt
backend/privateKey.json
```

Important:

```txt
Do not commit privateKey.json to GitHub.
Do not commit .env to GitHub.
```

The project can also use environment variables for production.

---

## Run the Backend

```bash
npm run dev
```

Expected output:

```txt
Server running on port 3000
```

---

## Server URL

```txt
http://localhost:3000
```

## API Base URL

```txt
http://localhost:3000/api
```

---

## Main Backend Features

### Authentication

* Login with email and password
* JWT token generation
* Protected routes
* Role-based access
* Account lockout after failed attempts

Allowed roles:

```txt
student
teacher
admin
```

---

### Admin Features

* User CRUD
* Audio recordings management
* Conversations review
* Words review
* AI analytics proxy
* AI logs proxy
* AI circuit reset
* Chat statistics

---

### Teacher Features

* View assigned students
* View student progress
* View student attempts
* View student chats

---

### Chat Features

* AI chat sessions
* Voice chat support
* Shared user chats
* Unread chat logic
* Notifications
* Chat history
* Archive/delete chat

---

### Audio Dataset Management

Admin can manage educational audio recordings.

Supported fields:

```js
{
  title,
  description,
  level,
  language,
  category,
  transcriptText,
  audioUrl,
  duration,
  tags,
  createdBy,
  createdAt,
  updatedAt,
  isActive
}
```

Current storage mode:

```txt
Local storage under backend/uploads/
```

Future production option:

```txt
Firebase Storage after enabling billing/Blaze plan
```

---

## Important Notes

* `.env` is ignored by git.
* `backend/privateKey.json` is ignored by git.
* `backend/uploads/` should not be used as permanent production storage unless the deployment server supports persistent disk.
* Firebase Storage requires correct bucket configuration.
* Gemini API warning appears if the API key is missing.
* For production, environment variables should be configured on the hosting provider.

---

## Scripts

```bash
npm run dev
```

Runs backend using nodemon.

```bash
npm start
```

Runs backend using node.

```bash
npm test
```

Runs backend tests.

---

## Basic cURL Tests

### Health Check

```bash
curl http://localhost:3000/api/health
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@test.com\",\"password\":\"Test1234!\"}"
```

### Get Current User

```bash
curl http://localhost:3000/api/users/me -H "Authorization: Bearer <token>"
```

---

## Final Backend Status

Completed:

* Authentication
* Admin users
* Admin audio recordings
* Admin conversations
* Admin words review
* Teacher APIs
* Shared chats
* Notifications
* AI chat integration
* Voice chat integration
* Progress APIs
* Validation
* Security
* Firebase integration
* Local upload support

Remaining work is mainly frontend integration, final QA, and production deployment configuration.
