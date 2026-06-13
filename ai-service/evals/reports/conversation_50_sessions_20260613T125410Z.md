# Lisan 50 Session Conversation Audit

- Started: 2026-06-13T12:54:10.776396+00:00
- Completed: 2026-06-13T12:54:18.375607+00:00
- Target: 50 sessions x 10 turns = 500 turns
- Completed: 0 full sessions, 1 turns
- Stopped reason: quota_or_rate_limit_at_session_01_turn_01
- Average wall latency: 7597.9 ms

## Route Counts

- `fallback:PROVIDER_QUOTA`: 1

## Fallback Reasons

- `PROVIDER_QUOTA`: 1

## 1. Greetings and self introduction (`greetings_intro`)

- Session ID: `conv50-20260613T125410Z-01-greetings_intro`
- Level: `A1`

| # | Student message | Bot answer (HE) | Bot answer (AR) | Diagnosis | Latency |
|---:|---|---|---|---|---:|
| 1 | בוא נתרגל שיחה על היכרות וברכות. | יש עומס עכשיו. נסי שוב עוד מעט. |  | `fallback:PROVIDER_QUOTA` | 7597.9 |
