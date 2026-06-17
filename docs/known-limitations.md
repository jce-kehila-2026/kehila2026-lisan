# Known Limitations

This document is an honest, reviewer-facing summary of the current product's
known limitations and intentional trade-offs. It is distilled from internal
engineering trackers (archived under `archive/development-notes/`); the large
majority of items in those trackers are already resolved — what remains below is
what a reviewer may actually notice.

## Functional limitations

### 1. Server-side text-to-speech is intentionally disabled
The AI service returns text responses without server-generated audio
(`audioBase64` is `null`). Spoken playback is produced **client-side in the
browser** (Web Speech API). Consequences:
- Voice playback quality and availability depend on the browser/OS voices.
- An environment without browser speech synthesis will show the text reply with
  no audio.

This keeps the service free to run and avoids a paid TTS dependency; server-side
TTS (SSML scaffolding already exists) can be enabled later if required.

### 2. Out-of-scope detection can be over-eager at A1
The chatbot constrains itself to beginner Hebrew. The out-of-scope heuristic is
based on the ratio of unknown words, so a valid A1 message that contains one new
word among a few known words can occasionally trigger a fallback ("let's stay on
topic") response. This favors curriculum safety over flexibility and is pending
tuning against real student data.

### 3. Pronunciation scoring requires Azure Speech
Pronunciation assessment uses Azure Speech (gated by `USE_AZURE_PRONUNCIATION`
and `AZURE_SPEECH_KEY/REGION`). Without those credentials, pronunciation feedback
is unavailable while the rest of the chat experience continues to work.

## Operational limitations

### 4. Free-tier LLM provider chain
The provider chain (`gemini` → `anthropic` → `openai`) is designed for
**maximum free-tier usage**. Under heavy concurrent load or exhausted quotas,
responses fall back down the chain and, in the worst case, return a polite
fallback message rather than a model answer. Latency varies with the active
provider.

### 5. Browser-based speech-to-text is heavyweight on first load
Speech-to-text runs in-browser via a Whisper model (`@huggingface/transformers`).
The model downloads on first use, so the **first** voice transcription in a
session is slower; subsequent ones are fast.

### 6. Single-region defaults
Several services default to `localhost` endpoints and a single region. Production
deployment requires the documented environment variables (see
[DEPLOY.md](../DEPLOY.md)); missing critical vars now fail fast at startup rather
than failing silently.

## Known dead/legacy code (cleanup in progress)
A small amount of superseded frontend code and a duplicate component tree remain
in the repository. They are **not reachable** from the live router and do not
affect behavior. They are scheduled for a separate, reviewed cleanup pass and are
intentionally **not** removed here to keep this change SAFE-only. See the audit
notes in `archive/development-notes/` for the full inventory.

## Out of scope for this submission
- Commercial SaaS concerns (billing, multi-tenant quota metering) are planned but
  not part of the submitted product. The plan is archived under
  `archive/development-notes/saas_implementation_plan.md`.
