# Lisan Backend

Backend authentication service for the Lisan project.

---

## Tech Stack

- Node.js
- Express
- Firebase Admin SDK
- Firestore
- JWT (jsonwebtoken)
- bcrypt
- CORS
- dotenv
- Morgan
- Nodemon

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

Based on `.env.example`:

```env
PORT=3000
JWT_SECRET=your-secret-here
FIREBASE_PROJECT_ID=your-project-id
NODE_ENV=development
```

---

### 4. Add Firebase service account key

Place your Firebase key file here:

```text
backend/privateKey.json
```

⚠️ Important:  
Do NOT commit `privateKey.json` to GitHub.

---

### 5. Run the server

```bash
npm run dev
```

---

## Server URL

```text
http://localhost:3000
```

---

## API Base URL

```text
http://localhost:3000/api
```

---

## Available Endpoints

| Endpoint | Method | Description | Auth Required |
|---|---|---|---|
| `/api/health` | GET | Server health check | No |
| `/api/auth/login` | POST | Login with email and password | No |
| `/api/users/me` | GET | Get current user profile | Yes |

---

## Authentication Flow

1. User sends email and password to `/api/auth/login`
2. Server validates credentials
3. Server returns JWT token
4. User sends token in header:
   ```
   Authorization: Bearer <token>
   ```
5. Protected routes verify token and return data

---

## Test Users

| Email | Password | Role |
|---|---|---|
| student@test.com | Test1234! | student |
| expert@test.com | Test1234! | expert |
| admin@test.com | Test1234! | admin |

---

## Security Features

- Passwords are stored as bcrypt hashes (never plain text)
- JWT authentication with 24-hour expiration
- Account lockout after 5 failed login attempts
- Locked accounts stay locked for 10 minutes
- Firestore used as secure database
- Firebase credentials excluded from git

---

## Notes

- Make sure `.env` is not committed
- Make sure `privateKey.json` is ignored
- API documentation available in `API.md`
- Firestore rules are defined in `firestore.rules`

---

## Run Tests (Example)

### Login (Success)

```bash
curl -X POST http://localhost:3000/api/auth/login \
-H "Content-Type: application/json" \
-d '{"email":"student@test.com","password":"Test1234!"}'
```

---

### Login (Wrong Password)

```bash
curl -X POST http://localhost:3000/api/auth/login \
-H "Content-Type: application/json" \
-d '{"email":"student@test.com","password":"WrongPass"}'
```

---

### Get Current User

```bash
curl http://localhost:3000/api/users/me \
-H "Authorization: Bearer <token>"
```