# Lisan — AI Hebrew Tutor for Arabic Speakers

Lisan is an AI-powered language-learning platform that helps Arabic-speaking
beginners learn **Hebrew** through a safe, curriculum-constrained chatbot,
voice practice, guided conversation scenarios, and vocabulary games — with the
interface and support text presented bilingually (Hebrew + Arabic).

> Status: capstone / final-submission build. The product runs as three
> coordinated services (web app, API gateway, AI service).

## Table of contents
- [Problem statement](#problem-statement)
- [Key features](#key-features)
- [System architecture](#system-architecture)
- [AI architecture](#ai-architecture)
- [Tech stack](#tech-stack)
- [Setup](#setup)
- [Deployment](#deployment)
- [Documentation index](#documentation-index)
- [Demo flow](#demo-flow)
- [Known limitations](#known-limitations)
- [Team](#team)
- [License](#license)

## Problem statement
Arabic-speaking beginners learning Hebrew lack a patient, always-available tutor
that stays at their level, explains in their native language, and never
overwhelms them with out-of-curriculum vocabulary. Generic chatbots drift
off-level, leak advanced words, and are not safe or focused enough for guided
classroom use. Lisan provides a **beginner-locked** Hebrew tutor that is fast,
bilingual, voice-capable, and honest about its limits.

## Key features
- **Hebrew tutor chatbot** constrained to beginner (A1) curriculum, with Arabic
  support text and feminine Hebrew forms for the learner audience.
- **Voice practice** — speak in the browser; speech is transcribed and folded
  into the conversation, with pronunciation feedback.
- **Guided scenarios** — real-life conversations (family visit, airport,
  restaurant, doctor, job interview, …).
- **Vocabulary games** — a single game surface with categories → levels →
  flashcards → quiz; passing a quiz persists progress.
- **Shared practice rooms** for quick paired practice.
- **Teacher & admin tooling** — review conversations, manage students/words,
  view progress analytics, upload content datasets.
- **Bilingual, RTL-aware UI** with light/dark and accessibility preferences.

## System architecture
Three services communicate over HTTP; the frontend never talks to the AI
service directly — every request passes through the authenticated backend
gateway.

```
┌────────────┐     HTTPS      ┌──────────────────┐    HTTP     ┌────────────────────┐
│  Frontend  │ ─────────────▶ │  Backend gateway │ ──────────▶ │  AI service        │
│  React/Vite│   JWT auth     │  Express + Auth  │  internal   │  FastAPI (Python)  │
│            │ ◀───────────── │  Firestore I/O   │ ◀────────── │  LLM + RAG + STT   │
└────────────┘                └──────────────────┘             └────────────────────┘
        │                              │                                  │
   in-browser STT              Firestore (users,                  LLM providers,
   (Whisper)                   chats, progress)                   Azure pronunciation
```

- **Frontend** — UI, routing, i18n, in-browser speech-to-text (Whisper).
- **Backend** — authentication (JWT), authorization by role, Firestore
  persistence (users, conversations, progress, vocab), rate limiting, and a
  proxy to the AI service. Missing critical env vars fail fast at startup.
- **AI service** — the language intelligence: LLM provider chain, retrieval,
  guardrails, conversation memory, transcription, and pronunciation.

## AI architecture
- **Provider chain** (`ai-service/services/chat_provider.py`): `gemini` →
  `anthropic` → `openai`, optimized for free-tier usage. Each provider is gated
  by the presence of its API key; the chain falls forward on failure/quota and,
  in the worst case, returns a polite fallback rather than an error.
- **Retrieval (RAG)** over curated A1/A2 Hebrew transcripts to ground replies.
- **Guardrails** — vocabulary-leakage detection and grammar checks keep answers
  at level and surface what was corrected.
- **Conversation memory** — Redis-backed session memory (in-memory fallback).
- **Speech** — STT via Whisper (in-browser) and server-side helpers;
  pronunciation assessment via Azure Speech (optional, key-gated). Server-side
  TTS is intentionally disabled — playback is client-side (see limitations).
- **Evaluation** — scripted evals and audits under `ai-service/evals/`
  (`npm run eval:voice-stt`, etc.).

See [ai-service/AI_SERVICE_OVERVIEW.md](ai-service/AI_SERVICE_OVERVIEW.md) and
[ai-service/PROVIDER_ARCHITECTURE.md](ai-service/PROVIDER_ARCHITECTURE.md).

## Tech stack
| Layer | Technologies |
|-------|--------------|
| Frontend | React 18, Vite, React Router, react-i18next, Tailwind CSS (+ RTL), Framer Motion, lucide-react, `@huggingface/transformers` (in-browser Whisper STT) |
| Backend | Node.js, Express 5, Firebase Admin (Firestore), JSON Web Tokens, bcrypt, Multer, express-rate-limit, pino + morgan, axios |
| AI service | Python, FastAPI, Uvicorn; LLM SDKs (Google GenAI, Anthropic, OpenAI); Azure Speech; Redis (optional) |
| Infra | Docker / docker-compose, Firebase, GitHub Actions |

## Setup
Prerequisites: Node.js, Python 3, and (optionally) Docker.

```bash
# 1. install all dependencies (backend npm, frontend npm, ai-service pip)
npm run install:all

# 2. configure environment
#    create the required .env files (see DEPLOY.md for the full list of keys)

# 3. run all three services together
npm run dev
```

- Frontend → `http://localhost:5173`
- Backend → `http://localhost:3000`
- AI service → `http://localhost:8000`

Run tests:
```bash
npm run test:frontend     # vitest + build
npm run test:backend      # node --test
npm run test:ai-service   # pytest
npm run verify:handoff    # all of the above + voice STT eval
```

## Deployment
See **[DEPLOY.md](DEPLOY.md)** for production deployment, secret generation, and
the full environment-variable reference. `docker-compose.yml` is provided for a
containerized run.

## Documentation index
- [docs/README.md](docs/README.md) — full documentation index
- [docs/demo-flow.md](docs/demo-flow.md) — reviewer walkthrough
- [docs/known-limitations.md](docs/known-limitations.md) — current constraints
- [docs/chatbot-spec.md](docs/chatbot-spec.md) — chatbot behavior spec
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — UI/UX design system
- [backend/API.md](backend/API.md) — backend API reference
- [ai-service/AI_SERVICE_OVERVIEW.md](ai-service/AI_SERVICE_OVERVIEW.md) — AI pipeline
- `archive/` — development history (sprint plans, roadmaps, eval snapshots)

## Demo flow
A 3-minute reviewer path: `/login` → `/home` → open a game category and pass a
level → `/chatbot` (send a text and a voice message) → back to `/home` to see
updated stats. Full journeys (student / teacher / admin) are in
[docs/demo-flow.md](docs/demo-flow.md).

## Known limitations
Server-side TTS is disabled (playback is client-side), the beginner out-of-scope
filter can be over-eager, pronunciation needs Azure credentials, and the LLM
chain is tuned for free-tier quotas. Full details in
[docs/known-limitations.md](docs/known-limitations.md).

## Team
- Anas Akkari — Team lead — `anasakkari3`
- Tala Herbawi — Developer — `talaher`
- Abdullah Ahmaro — Scrum Master — `AbdullahAhmaro`
- Mohammd Salameh — Developer — `Mohammd-Salameh-44`
- Layan Rabba — Developer — `LayanRabba`

## License
See repository ownership notes. Specify a license (e.g., MIT) before public
release; some components serve a non-profit stakeholder.
