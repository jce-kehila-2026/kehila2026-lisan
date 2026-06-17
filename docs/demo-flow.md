# Demo Flow — Reviewer Walkthrough

This guide describes the exact path a reviewer should follow to exercise the
main features of **Lisan**. It assumes the three services are running locally
(see [setup](#running-locally)) or a deployed environment is available.

## Running locally

```bash
# from the repository root
npm run install:all     # backend (npm) + frontend (npm) + ai-service (pip)
npm run dev             # starts backend, frontend, and ai-service together
```

- Frontend: `http://localhost:5173`
- Backend (API gateway): `http://localhost:3000`
- AI service (FastAPI): `http://localhost:8000`

> Tip: setting `VITE_SKIP_AUTH=true` for the frontend lets you land directly on
> `/home` without logging in. Leave it **unset/false** for a realistic review.

---

## 1. Student journey (primary product)

| Step | Route | What to look for |
|------|-------|------------------|
| 1 | `/login` | Student login. Bilingual UI (Hebrew interface with Arabic support text), language toggle. |
| 2 | `/home` | Learner dashboard: greeting, level badge, animated progress + stats, quick activities, and the **word-game category picker**. |
| 3 | `/games` | The single word-game surface. Pick a category → levels → flashcards → short quiz. Passing a quiz marks the level complete and feeds the "words learned" stat. |
| 4 | `/home` → category card | Confirms the home picker **deep-links** into `/games?category=<key>` and opens that category directly. |
| 5 | `/chatbot` | Voice-first Hebrew tutor. Type or speak; responses are constrained to beginner Hebrew, with Arabic support and pronunciation feedback. |
| 6 | `/scenario/:id` | Guided conversation scenarios (e.g. family visit, airport, restaurant). |
| 7 | `/shared-chat` → `/shared-chat/:id` | Practice rooms for paired/quick practice. |
| 8 | `/profile` | Student profile and preferences (theme, text size, motion). |
| 9 | `/more` | Secondary navigation / history. |

**Suggested 3-minute demo:** `/login` → `/home` → open one game category and pass
a level → `/chatbot` and send one message (text and voice) → back to `/home` to
see the updated stats.

---

## 2. Teacher journey

| Step | Route | What to look for |
|------|-------|------------------|
| 1 | `/teacher/login` | Teacher authentication. |
| 2 | `/teacher/dashboard` | Teacher home. |
| 3 | `/teacher/reviews` | Review student conversations / progress. |
| 4 | `/teacher/stories/upload` | Dataset uploader (bundles content as a ZIP for the AI content pipeline). |

## 3. Admin journey

| Step | Route | What to look for |
|------|-------|------------------|
| 1 | `/admin/login` | Admin authentication. |
| 2 | `/admin/dashboard` | Admin overview. |
| 3 | `/admin/students` | Student management. |
| 4 | `/admin/conversations` | Conversation monitoring. |
| 5 | `/admin/words` | Vocabulary management. |
| 6 | `/admin/progress` | Progress analytics. |
| 7 | `/admin/notifications` | Notifications. |

---

## What to verify works end-to-end

1. **Auth** — protected routes redirect to the correct login when signed out.
2. **Chat round-trip** — a message travels Frontend → Express backend → FastAPI
   ai-service → LLM provider and returns a constrained, beginner-appropriate reply.
3. **Voice input** — browser audio is transcribed (Whisper in-browser STT) and the
   transcript becomes part of the conversation.
4. **Game progress** — passing a quiz persists and is reflected on `/home`.
5. **Bilingual behavior** — Hebrew responses with Arabic support text; feminine
   Hebrew forms (the learner audience is female).

See [known-limitations.md](known-limitations.md) for expected rough edges.
